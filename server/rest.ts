// Motor de consultas compatible con lo que usaba el frontend de Supabase (PostgREST):
// el navegador arma la consulta (tabla, filtros, orden, rango, relaciones) y acá se
// traduce a SQL sobre MySQL, solo para tablas y columnas conocidas.
import express from "express";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, withTransaction, type Executor, type Row } from "./db";
import { type AuthedRequest, type User, loadSession, requireUser } from "./auth";
import { HttpError, wrap, apiErrorHandler } from "./http";

type ColType = "text" | "num" | "bool" | "json" | "datetime" | "date";

interface TableDef {
  pk: string;
  /** "uuid": el servidor genera el id si no viene. "auto": AUTO_INCREMENT. */
  idMode: "uuid" | "auto";
  columns: Record<string, ColType>;
  /** Columna con el dueño de la fila: cada usuario solo ve y modifica las suyas. */
  owner?: string;
  defaultOrder?: string;
}

const T = (columns: Record<string, ColType>, extra: Partial<TableDef> = {}): TableDef => ({
  pk: "id",
  idMode: "uuid",
  columns: { id: "text", created_at: "datetime", ...columns },
  ...extra,
});

export const TABLES: Record<string, TableDef> = {
  llamados: T(
    {
      user_id: "text", titulo: "text", link: "text", organismo: "text", estado: "text",
      fecha_cierre_texto: "text", descripcion_completa: "text", fecha_publicacion: "datetime",
      fecha_modificacion: "datetime", items: "json", presentado: "bool", adjudicado: "bool",
      adjudicado_items: "json", adjudicado_monto: "num", updated_at: "datetime",
    },
    { owner: "user_id" },
  ),
  presupuestos: T({ llamado_id: "text", items: "json", total_presupuesto: "num", updated_at: "datetime" }),
  lista_precios: T({
    item_nombre: "text", cantidad: "num", precio_unitario: "num", llamado_id: "text",
    llamado_titulo: "text", presupuesto_id: "text",
  }),
  clientes: T({ name: "text", cuit: "text" }),
  productos_base: T({ nombre: "text", codigo: "text", precio_unitario: "num", moneda: "text", iva: "num" }),
  precios_cliente: T({
    cliente_id: "text", producto_id: "text", precio_unitario: "num", iva: "num", moneda: "text",
    fecha_ultima_venta: "date", updated_at: "datetime",
  }),
  temp_precios_import: {
    pk: "id",
    idMode: "auto",
    owner: "import_user_id",
    columns: {
      id: "num", import_user_id: "text", cliente_cuit: "text", producto_codigo: "text",
      precio_unitario: "num", fecha_ultima_venta: "date", iva: "num", moneda: "text",
    },
  },
  presupuestos_clientes: T({ cliente_id: "text", items: "json", subtotal: "num", iva: "num", total: "num", moneda: "text" }),
  pliego_config: T({ razon_social: "text", rut: "text", direccion: "text", email: "text", telefono: "text", footer_texto: "text", firma_imagen: "text", whatsapp_pagos: "text", condiciones_pliego: "text" }),
  palabras_clave_llamados: T({ palabra: "text" }),
  organismos_filter: T({ name: "text" }),
  ai_prompts: T({ slug: "text", name: "text", description: "text", prompt_text: "text" }),
  proveedores: T({
    clave: "text", nombre: "text", rut: "text", whatsapp: "text", banco: "text", tipo_cuenta: "text",
    numero_cuenta: "text", moneda: "text", notas: "text",
  }),
  depositos: T({
    fecha: "date", proveedor_id: "text", proveedor: "text", banco: "text", tipo_cuenta: "text", numero_cuenta: "text",
    moneda: "text", monto: "num", concepto: "text", pagado: "bool", fecha_pagado: "date", import_key: "text",
  }),
  cheques: T({
    proveedor_id: "text", proveedor: "text", fecha_entrega: "date", fecha_pago: "date", banco: "text", numero: "text",
    moneda: "text", monto: "num", concepto: "text", estado: "text", import_key: "text",
  }),
  cobro_clientes: T({ clave: "text", nombre: "text", tipo: "text", modalidad: "text", rut: "text", whatsapp: "text", notas: "text" }),
  facturas: T({
    emisor: "text", cliente_id: "text", cliente: "text", numero: "text", fecha: "date", oc: "text", moneda: "text",
    importe: "num", cobrada: "bool", fecha_cobro: "date", detalle: "text", import_key: "text",
  }),
  cobros: T({
    emisor: "text", cliente_id: "text", cliente: "text", fecha: "date", moneda: "text", importe: "num",
    medio: "text", detalle: "text", import_key: "text",
  }),
  stock_productos: T({
    clave: "text", nombre: "text", categoria: "text", unidad: "text", stock_minimo: "num", costo: "num",
    alias: "json", activo: "bool", notas: "text",
  }),
  stock_ubicaciones: T({
    nombre: "text", tipo: "text", padre_id: "text", proveedor_id: "text", orden: "num", activo: "bool", notas: "text", import_key: "text",
  }),
  stock_movimientos: T({
    fecha: "date", producto_id: "text", ubicacion_id: "text", tipo: "text", cantidad: "num", costo: "num",
    grupo: "text", referencia: "text", nota: "text", import_key: "text",
  }),
  stock_cierres: T({
    mes: "text", fecha: "date", items: "json", valor_dentro: "num", valor_afuera: "num", nota: "text", origen: "text",
  }),
};

interface Relation {
  table: string;
  kind: "one" | "many";
  localKey: string;
  foreignKey: string;
}
const one = (table: string, localKey: string): Relation => ({ table, kind: "one", localKey, foreignKey: "id" });
const many = (table: string, foreignKey: string): Relation => ({ table, kind: "many", localKey: "id", foreignKey });

const RELATIONS: Record<string, Record<string, Relation>> = {
  llamados: { presupuestos: many("presupuestos", "llamado_id"), lista_precios: many("lista_precios", "llamado_id") },
  presupuestos: { llamados: one("llamados", "llamado_id"), lista_precios: many("lista_precios", "presupuesto_id") },
  lista_precios: { llamados: one("llamados", "llamado_id"), presupuestos: one("presupuestos", "presupuesto_id") },
  clientes: { precios_cliente: many("precios_cliente", "cliente_id"), presupuestos_clientes: many("presupuestos_clientes", "cliente_id") },
  productos_base: { precios_cliente: many("precios_cliente", "producto_id") },
  precios_cliente: { clientes: one("clientes", "cliente_id"), productos_base: one("productos_base", "producto_id") },
  presupuestos_clientes: { clientes: one("clientes", "cliente_id") },
  proveedores: { depositos: many("depositos", "proveedor_id"), cheques: many("cheques", "proveedor_id") },
  depositos: { proveedores: one("proveedores", "proveedor_id") },
  cheques: { proveedores: one("proveedores", "proveedor_id") },
  cobro_clientes: { facturas: many("facturas", "cliente_id"), cobros: many("cobros", "cliente_id") },
  facturas: { cobro_clientes: one("cobro_clientes", "cliente_id") },
  cobros: { cobro_clientes: one("cobro_clientes", "cliente_id") },
  stock_productos: { stock_movimientos: many("stock_movimientos", "producto_id") },
  stock_ubicaciones: { stock_movimientos: many("stock_movimientos", "ubicacion_id"), proveedores: one("proveedores", "proveedor_id") },
  stock_movimientos: { stock_productos: one("stock_productos", "producto_id"), stock_ubicaciones: one("stock_ubicaciones", "ubicacion_id") },
};

// ---------- Selección de columnas: "*, llamados(*), presupuestos!fk(id, items)" ----------

interface SelectSpec {
  all: boolean;
  columns: string[];
  embeds: { name: string; spec: SelectSpec }[];
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseSelect(raw: string | undefined | null): SelectSpec {
  const text = (raw ?? "*").replace(/\s+/g, " ").trim() || "*";
  const spec: SelectSpec = { all: false, columns: [], embeds: [] };
  for (const part of splitTopLevel(text)) {
    const embed = part.match(/^([a-z_]+)\s*(?:![a-z_0-9]+)?\s*\((.*)\)$/i);
    if (embed) {
      spec.embeds.push({ name: embed[1], spec: parseSelect(embed[2]) });
    } else if (part === "*") {
      spec.all = true;
    } else {
      const column = part.includes(":") ? part.split(":").pop()!.trim() : part;
      spec.columns.push(column);
    }
  }
  return spec;
}

// ---------- Conversión de valores ----------

function toDb(type: ColType, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case "json":
      return JSON.stringify(value);
    case "bool":
      return value === true || value === 1 || value === "true" || value === "1" ? 1 : 0;
    case "num": {
      if (value === "") return null;
      const n = Number(typeof value === "string" ? value.replace(",", ".") : value);
      return Number.isFinite(n) ? n : null;
    }
    case "datetime": {
      const d = value instanceof Date ? value : new Date(value as string);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case "date": {
      const s = String(value);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

function fromDb(def: TableDef, row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const type = def.columns[key];
    if (type === "bool") out[key] = value === null ? null : Boolean(value);
    else if (type === "json") {
      try {
        out[key] = value === null ? null : JSON.parse(value);
      } catch {
        out[key] = value;
      }
    } else out[key] = value;
  }
  return out;
}

// ---------- Filtros ----------

interface Filter {
  type: string;
  column?: string;
  value?: unknown;
}

const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function getTable(name: unknown): TableDef {
  const def = typeof name === "string" ? TABLES[name] : undefined;
  if (!def || !Object.hasOwn(TABLES, name as string)) throw new HttpError(404, `Tabla desconocida: ${String(name)}`, "42P01");
  return def;
}

function checkColumn(def: TableDef, column: unknown): string {
  if (typeof column !== "string" || !Object.hasOwn(def.columns, column)) {
    throw new HttpError(400, `Columna desconocida: ${String(column)}`, "42703");
  }
  return column;
}

function condition(def: TableDef, f: Filter, params: unknown[]): string {
  if (f.type === "or") return orCondition(def, String(f.value ?? ""), params);
  const column = checkColumn(def, f.column);
  const type = def.columns[column];
  const col = `\`${column}\``;
  const value = f.value;
  switch (f.type) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if (value === null) return f.type === "neq" ? `${col} IS NOT NULL` : `${col} IS NULL`;
      params.push(toDb(type, value));
      return `${col} ${OPS[f.type]} ?`;
    case "like":
    case "ilike":
      params.push(String(value).replace(/\*/g, "%"));
      return f.type === "ilike" ? `LOWER(${col}) LIKE LOWER(?)` : `${col} LIKE ?`;
    case "in": {
      const list = Array.isArray(value) ? value : [];
      if (!list.length) return "1 = 0";
      params.push(...list.map((v) => toDb(type, v)));
      return `${col} IN (${list.map(() => "?").join(", ")})`;
    }
    case "is":
      if (value === null || value === "null") return `${col} IS NULL`;
      params.push(toDb("bool", value));
      return `${col} = ?`;
    default:
      throw new HttpError(400, `Filtro no soportado: ${f.type}`);
  }
}

/** Filtros "or" de PostgREST: "item_nombre.ilike.%x%,llamado_titulo.ilike.%x%". */
function orCondition(def: TableDef, text: string, params: unknown[]): string {
  const parts = text.split(/,(?=[a-z_]+\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is)\.)/i);
  const conditions = parts.map((part) => {
    const match = part.match(/^([a-z_]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/is);
    if (!match) throw new HttpError(400, `Filtro "or" inválido: ${part}`);
    const [, column, type, rawValue] = match;
    const value = type === "is" || rawValue !== "null" ? rawValue : null;
    return condition(def, { type, column, value }, params);
  });
  return conditions.length ? `(${conditions.join(" OR ")})` : "1 = 1";
}

function buildWhere(def: TableDef, filters: Filter[], user: User, params: unknown[]): string {
  const parts = filters.map((f) => condition(def, f, params));
  if (def.owner) {
    parts.push(`\`${def.owner}\` = ?`);
    params.push(user.id);
  }
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

// ---------- Lectura ----------

interface Order {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

async function selectRows(
  db: Executor,
  tableName: string,
  opts: { filters?: Filter[]; order?: Order[]; limit?: number; offset?: number },
  user: User,
): Promise<Row[]> {
  const def = getTable(tableName);
  const params: unknown[] = [];
  let sql = `SELECT * FROM \`${tableName}\` ${buildWhere(def, opts.filters ?? [], user, params)}`;
  const order = opts.order ?? [];
  if (order.length) {
    sql += " ORDER BY " + order.map((o) => `\`${checkColumn(def, o.column)}\` ${o.ascending === false ? "DESC" : "ASC"}`).join(", ");
  }
  if (opts.limit !== undefined) {
    sql += " LIMIT ? OFFSET ?";
    params.push(Math.max(0, Math.floor(opts.limit)), Math.max(0, Math.floor(opts.offset ?? 0)));
  }
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => fromDb(def, row));
}

/** Agrega las relaciones pedidas (p. ej. llamados(*)) y deja solo las columnas pedidas. */
async function shape(db: Executor, tableName: string, rows: Row[], spec: SelectSpec, user: User): Promise<Row[]> {
  const def = getTable(tableName);
  const embedded: Record<string, Map<unknown, Row | Row[]>> = {};
  for (const { name, spec: childSpec } of spec.embeds) {
    const rel = RELATIONS[tableName]?.[name];
    if (!rel) throw new HttpError(400, `No hay relación entre ${tableName} y ${name}.`, "PGRST200");
    const keys = [...new Set(rows.map((r) => r[rel.localKey]).filter((v) => v !== null && v !== undefined))];
    const map = new Map<unknown, Row | Row[]>();
    if (keys.length) {
      const children = await selectRows(
        db, rel.table, { filters: [{ type: "in", column: rel.foreignKey, value: keys }], order: [{ column: "created_at" }] }, user,
      );
      const shaped = await shape(db, rel.table, children, { ...childSpec, columns: [...childSpec.columns] }, user);
      children.forEach((child, i) => {
        const key = child[rel.foreignKey];
        if (rel.kind === "one") map.set(key, shaped[i]);
        else map.set(key, [...((map.get(key) as Row[]) ?? []), shaped[i]]);
      });
    }
    embedded[name] = map;
  }
  return rows.map((row) => {
    const out: Row = {};
    if (spec.all || (!spec.columns.length && !spec.embeds.length)) Object.assign(out, row);
    for (const column of spec.columns) {
      checkColumn(def, column);
      out[column] = row[column];
    }
    for (const { name } of spec.embeds) {
      const rel = RELATIONS[tableName][name];
      const value = embedded[name].get(row[rel.localKey]);
      out[name] = rel.kind === "one" ? (value ?? null) : (value ?? []);
    }
    return out;
  });
}

// ---------- Escritura ----------

function prepareRow(def: TableDef, input: unknown, user: User): Row {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Datos inválidos.");
  const row: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(def.columns, key) || key === def.owner || value === undefined) continue; // columnas desconocidas se ignoran
    if (key === def.pk && def.idMode === "auto") continue;
    row[key] = toDb(def.columns[key], value);
  }
  if (def.owner) row[def.owner] = user.id;
  return row;
}

async function insertRows(
  db: Executor,
  tableName: string,
  inputs: unknown[],
  user: User,
  upsert?: { onConflict?: string; ignoreDuplicates?: boolean },
): Promise<{ ids: unknown[]; conflictValues: unknown[] }> {
  const def = getTable(tableName);
  const rows = inputs.map((input) => {
    const row = prepareRow(def, input, user);
    if (def.idMode === "uuid" && !row[def.pk]) row[def.pk] = randomUUID();
    return row;
  });
  const conflictColumns = (upsert?.onConflict || def.pk).split(",").map((c) => checkColumn(def, c.trim()));

  // Nadie puede pisar filas de otro usuario con un upsert.
  if (upsert && def.owner) {
    const ids = rows.map((r) => r[def.pk]).filter(Boolean);
    if (ids.length) {
      const [taken] = await db.query<RowDataPacket[]>(
        `SELECT 1 FROM \`${tableName}\` WHERE \`${def.pk}\` IN (?) AND (\`${def.owner}\` IS NULL OR \`${def.owner}\` <> ?) LIMIT 1`,
        [ids, user.id],
      );
      if (taken.length) throw new HttpError(403, "No tenés permiso para modificar ese registro.", "42501");
    }
  }

  // Agrupa filas con las mismas columnas para insertarlas de a varias.
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = Object.keys(row).sort().join(",");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, group] of groups) {
    const columns = key.split(",").filter(Boolean);
    if (!columns.length) throw new HttpError(400, "No hay datos para guardar.");
    const updatable = columns.filter((c) => c !== def.pk && !conflictColumns.includes(c) && c !== "created_at");
    for (let i = 0; i < group.length; i += 500) {
      const chunk = group.slice(i, i + 500);
      const params: unknown[] = [];
      const values = chunk.map((row) => {
        params.push(...columns.map((c) => row[c]));
        return `(${columns.map(() => "?").join(", ")})`;
      });
      let sql = `INSERT ${upsert?.ignoreDuplicates ? "IGNORE " : ""}INTO \`${tableName}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES ${values.join(", ")}`;
      if (upsert && !upsert.ignoreDuplicates) {
        sql += ` ON DUPLICATE KEY UPDATE ${
          updatable.length ? updatable.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ") : `\`${def.pk}\` = \`${def.pk}\``
        }`;
      }
      await db.query(sql, params);
    }
  }
  const singleConflict = conflictColumns.length === 1 ? conflictColumns[0] : def.pk;
  return {
    ids: rows.map((r) => r[def.pk]),
    conflictValues: upsert ? rows.map((r) => r[singleConflict]).filter((v) => v !== null && v !== undefined) : [],
  };
}

// ---------- Endpoint principal ----------

interface QueryBody {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  select?: string | null;
  returning?: boolean;
  count?: "exact" | null;
  head?: boolean;
  filters?: Filter[];
  order?: Order[];
  limit?: number;
  offset?: number;
  values?: unknown;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  single?: "single" | "maybe" | null;
}

async function runQuery(body: QueryBody, user: User): Promise<{ data: unknown; count: number | null }> {
  const def = getTable(body.table);
  const filters = Array.isArray(body.filters) ? body.filters : [];
  const spec = parseSelect(body.select);

  return withTransaction(async (db) => {
    let rows: Row[] = [];
    let count: number | null = null;

    switch (body.action) {
      case "select": {
        if (body.count === "exact") {
          const params: unknown[] = [];
          const [res] = await db.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS n FROM \`${body.table}\` ${buildWhere(def, filters, user, params)}`, params,
          );
          count = Number(res[0].n);
        }
        if (body.head) return { data: null, count };
        rows = await selectRows(db, body.table, { filters, order: body.order, limit: body.limit, offset: body.offset }, user);
        break;
      }
      case "insert":
      case "upsert": {
        const inputs = Array.isArray(body.values) ? body.values : [body.values];
        if (!inputs.length) return { data: [], count: null };
        if (inputs.length > 5000) throw new HttpError(400, "Demasiadas filas en una sola operación.");
        const upsert = body.action === "upsert" ? { onConflict: body.onConflict, ignoreDuplicates: body.ignoreDuplicates } : undefined;
        const { ids, conflictValues } = await insertRows(db, body.table, inputs, user, upsert);
        if (!body.returning) return { data: null, count: null };
        const conflictColumn = (body.onConflict || def.pk).split(",")[0].trim();
        rows = upsert && conflictColumn !== def.pk
          ? await selectRows(db, body.table, { filters: [{ type: "in", column: conflictColumn, value: conflictValues }] }, user)
          : await selectRows(db, body.table, { filters: [{ type: "in", column: def.pk, value: ids }] }, user);
        break;
      }
      case "update": {
        if (!filters.length) throw new HttpError(400, "Una actualización necesita al menos un filtro.");
        const targets = await selectRows(db, body.table, { filters }, user);
        const ids = targets.map((r) => r[def.pk]);
        const changes = prepareRow(def, body.values, user);
        delete changes[def.pk];
        if (def.owner) delete changes[def.owner];
        const columns = Object.keys(changes);
        if (ids.length && columns.length) {
          await db.query(
            `UPDATE \`${body.table}\` SET ${columns.map((c) => `\`${c}\` = ?`).join(", ")} WHERE \`${def.pk}\` IN (?)`,
            [...columns.map((c) => changes[c]), ids],
          );
        }
        if (!body.returning) return { data: null, count: null };
        rows = await selectRows(db, body.table, { filters: [{ type: "in", column: def.pk, value: ids }] }, user);
        break;
      }
      case "delete": {
        if (!filters.length) throw new HttpError(400, "Un borrado necesita al menos un filtro.");
        const targets = await selectRows(db, body.table, { filters }, user);
        const ids = targets.map((r) => r[def.pk]);
        if (ids.length) await db.query(`DELETE FROM \`${body.table}\` WHERE \`${def.pk}\` IN (?)`, [ids]);
        if (!body.returning) return { data: null, count: null };
        rows = targets;
        break;
      }
      default:
        throw new HttpError(400, "Operación inválida.");
    }

    const data = await shape(db, body.table, rows, spec, user);
    if (body.single) {
      if (data.length > 1 || (body.single === "single" && data.length === 0)) {
        throw new HttpError(406, "Se esperaba un único resultado.", "PGRST116");
      }
      return { data: data[0] ?? null, count };
    }
    return { data, count };
  });
}

// ---------- Funciones RPC ----------

/** Pasa los precios importados (tabla temporal) a precios_cliente, quedándose con la venta más reciente. */
async function mergeTempPrices(user: User): Promise<number> {
  return withTransaction(async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT t.id, t.precio_unitario, t.fecha_ultima_venta, t.iva, t.moneda, c.id AS cliente_id, p.id AS producto_id
       FROM temp_precios_import t
       JOIN clientes c ON c.cuit = t.cliente_cuit
       JOIN productos_base p ON p.codigo = t.producto_codigo
       WHERE t.import_user_id = ?`,
      [user.id],
    );
    const latest = new Map<string, RowDataPacket>();
    for (const row of rows) {
      const key = `${row.cliente_id}|${row.producto_id}`;
      const prev = latest.get(key);
      if (!prev || String(row.fecha_ultima_venta ?? "") >= String(prev.fecha_ultima_venta ?? "")) latest.set(key, row);
    }
    const items = [...latest.values()];
    // La condición compara con la fecha guardada; por eso fecha_ultima_venta se asigna al final.
    const newer = "(fecha_ultima_venta IS NULL OR VALUES(fecha_ultima_venta) >= fecha_ultima_venta)";
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      const params: unknown[] = [];
      const values = chunk.map((r) => {
        params.push(randomUUID(), r.cliente_id, r.producto_id, r.precio_unitario, r.iva ?? 22, r.moneda || "UYU", r.fecha_ultima_venta);
        return "(?, ?, ?, ?, ?, ?, ?)";
      });
      await db.query(
        `INSERT INTO precios_cliente (id, cliente_id, producto_id, precio_unitario, iva, moneda, fecha_ultima_venta)
         VALUES ${values.join(", ")}
         ON DUPLICATE KEY UPDATE
           precio_unitario = IF(${newer}, VALUES(precio_unitario), precio_unitario),
           iva = IF(${newer}, VALUES(iva), iva),
           moneda = IF(${newer}, VALUES(moneda), moneda),
           fecha_ultima_venta = IF(${newer}, VALUES(fecha_ultima_venta), fecha_ultima_venta)`,
        params,
      );
    }
    await db.query("DELETE FROM temp_precios_import WHERE import_user_id = ?", [user.id]);
    return items.length;
  });
}

const RPC: Record<string, (user: User, args: Record<string, unknown>) => Promise<unknown>> = {
  is_superadmin: async (user) => user.role === "admin",
  merge_temp_prices: (user) => mergeTempPrices(user),
};

export function restRouter() {
  const router = express.Router();
  router.use(loadSession, requireUser);

  router.post("/query", wrap(async (req, res) => {
    const result = await runQuery(req.body ?? {}, req.user!);
    res.json(result);
  }));

  router.post("/rpc/:fn", wrap(async (req, res) => {
    const fn = Object.hasOwn(RPC, req.params.fn) ? RPC[req.params.fn] : undefined;
    if (!fn) throw new HttpError(404, `Función desconocida: ${req.params.fn}`, "42883");
    res.json({ data: (await fn(req.user!, req.body ?? {})) ?? null });
  }));

  router.use(apiErrorHandler);
  return router;
}

/** Lectura directa para otras partes del servidor (funciones de IA). */
export async function querySql<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params);
  return rows as T[];
}
