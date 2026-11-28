// Fase 4 de la unificación: lo que falta cobrar de las ventas de SVC, visto y cobrado desde Cobros.
// La venta de SVC sigue siendo la única fuente: marcarla cobrada acá cambia su estado en SVC
// (pasa a "pagada" con su fecha de cobro, que es la que usan las comisiones).
import express from "express";
import type { RowDataPacket } from "mysql2/promise";
import { type AuthedRequest, loadSession, requireOficina } from "./auth";
import { getPool, withTransaction } from "./db";
import { HttpError, wrap, apiErrorHandler } from "./http";

const MEDIOS = ["Efectivo", "Transferencia", "Cheque", "Débito", "Crédito", "Depósito", "Otro"];
const DIAS_HISTORIA = 400; // ventas y cobros de los últimos ~13 meses (para el resumen mensual)

interface Venta {
  id: string;
  number?: number;
  date?: string;
  clientId?: string;
  clientName?: string;
  clientDoc?: string;
  deliveryPhone?: string;
  total?: number;
  status?: string;
  paidAt?: string;
  payment?: string;
  userName?: string;
  list?: string;
  cobro?: { fecha: string; medio: string; nota?: string; por: string; el: string };
}

const verLista = (req: AuthedRequest, lista?: string) => req.user?.role === "admin" || lista !== "remar";

function publica(v: Venta, telefonos: Map<string, string>) {
  return {
    id: v.id,
    numero: v.number ?? null,
    fecha: String(v.date || "").slice(0, 10),
    cliente: v.clientName || "Consumidor final",
    clienteId: v.clientId || null,
    rut: v.clientDoc || "",
    telefono: (v.clientId && telefonos.get(v.clientId)) || v.deliveryPhone || "",
    total: Number(v.total) || 0,
    estado: v.status,
    pagadaEl: v.paidAt ? String(v.paidAt).slice(0, 10) : null,
    pago: v.payment || "",
    vendedor: v.userName || "",
    lista: v.list || "comercio",
    cobro: v.cobro || null,
  };
}

export function svcVentasRouter() {
  const router = express.Router();
  router.use(loadSession, requireOficina);

  // Ventas de SVC pendientes de cobro y las de los últimos meses (cobradas o no).
  router.get("/", wrap(async (req, res) => {
    const pool = getPool();
    const [ventas] = await pool.query<RowDataPacket[]>("SELECT data FROM svc_docs WHERE collection = 'sales'");
    const [clientes] = await pool.query<RowDataPacket[]>("SELECT data FROM svc_docs WHERE collection = 'clients'");
    const telefonos = new Map<string, string>();
    for (const r of clientes) {
      const c = JSON.parse(r.data);
      if (c.phone) telefonos.set(c.id, c.phone);
    }
    const desde = new Date(Date.now() - DIAS_HISTORIA * 864e5).toISOString().slice(0, 10);
    const out = [];
    for (const r of ventas) {
      const v = JSON.parse(r.data) as Venta;
      if (v.status === "anulada" || !verLista(req, v.list)) continue;
      const reciente = String(v.date || "") >= desde || String(v.paidAt || "") >= desde;
      if (v.status === "pendiente" || reciente) out.push(publica(v, telefonos));
    }
    res.json({ ventas: out });
  }));

  // Marca cobrada una venta pendiente de SVC.
  router.post("/:id/cobrar", wrap(async (req, res) => {
    const fecha = String(req.body?.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new HttpError(400, "Fecha inválida.");
    const medio = MEDIOS.includes(req.body?.medio) ? req.body.medio : "Otro";
    const nota = String(req.body?.nota || "").trim().slice(0, 300);
    const venta = await withTransaction(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT data FROM svc_docs WHERE collection = 'sales' AND id = ? FOR UPDATE", [req.params.id]);
      if (!rows.length) throw new HttpError(404, "Venta no encontrada.");
      const v = JSON.parse(rows[0].data) as Venta;
      if (!verLista(req, v.list)) throw new HttpError(404, "Venta no encontrada.");
      if (v.status !== "pendiente") throw new HttpError(400, "Esa venta ya no está pendiente de cobro.");
      v.status = "pagada";
      v.paidAt = new Date(`${fecha}T12:00:00-03:00`).toISOString();
      v.cobro = { fecha, medio, nota, por: req.user!.name || req.user!.email, el: new Date().toISOString() };
      await conn.query("UPDATE svc_docs SET data = ? WHERE collection = 'sales' AND id = ?", [JSON.stringify(v), v.id]);
      return v;
    });
    res.json({ venta: publica(venta, new Map()) });
  }));

  // Deshace un cobro hecho desde Cobros (vuelve a pendiente). Solo administradores.
  router.post("/:id/pendiente", wrap(async (req, res) => {
    if (req.user?.role !== "admin") throw new HttpError(403, "Solo un administrador puede deshacer un cobro.");
    const venta = await withTransaction(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT data FROM svc_docs WHERE collection = 'sales' AND id = ? FOR UPDATE", [req.params.id]);
      if (!rows.length) throw new HttpError(404, "Venta no encontrada.");
      const v = JSON.parse(rows[0].data) as Venta;
      if (!v.cobro) throw new HttpError(400, "Esa venta no se cobró desde Cobros: cambiala desde Ventas (SVC).");
      v.status = "pendiente";
      delete v.paidAt;
      delete v.cobro;
      await conn.query("UPDATE svc_docs SET data = ? WHERE collection = 'sales' AND id = ?", [JSON.stringify(v), v.id]);
      return v;
    });
    res.json({ venta: publica(venta, new Map()) });
  }));

  router.use(apiErrorHandler);
  return router;
}
