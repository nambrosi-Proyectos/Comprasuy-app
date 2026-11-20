// Equivalentes de las "Edge Functions" de Supabase. El navegador las llama con
// supabase.functions.invoke(nombre, { body }); las que tardan (IA) siguen en segundo
// plano y el navegador consulta hasta que terminan, porque el proxy de Hostinger corta
// las conexiones largas.
import express from "express";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { type AuthedRequest, type User, loadSession, requireUser } from "./auth";
import { HttpError, wrap, apiErrorHandler } from "./http";
import { generateText, extractJson, aiProvider, AiError } from "./ai";
import { renderPrompt } from "./prompts";
import { querySql } from "./rest";
import { getPool } from "./db";
import { type ItemLlamado, fetchLlamadoItems, itemTexto, cantidadTexto } from "./llamadoPage";

type Fn = (body: any, user: User) => Promise<unknown>;

// ---------- RSS de comprasestatales.gub.uy ----------

const RSS_URL = process.env.RSS_URL || "https://www.comprasestatales.gub.uy/consultas/rss";
let rssCache: { at: number; items: any[]; lastBuildDate?: string } | null = null;

async function loadRss() {
  if (rssCache && Date.now() - rssCache.at < 2 * 60 * 1000) return rssCache;
  const response = await fetch(RSS_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ComprasuyApp/1.0)" } });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const xml = await response.text();
  const doc = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true, parseTagValue: false }).parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel?.item) throw new Error("Invalid RSS feed structure");
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];
  rssCache = { at: Date.now(), items, lastBuildDate: channel.lastBuildDate };
  return rssCache;
}

const text = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? String((v as any)["#text"] ?? "") : String(v));
const validDate = (v: string | undefined, fallback: Date) => {
  const d = v ? new Date(v) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
};

/** "17/03/2027 11:00hs" (hora de Uruguay, UTC-3) → Date; null si no se entiende. */
export function parseFechaUy(texto: string | undefined): Date | null {
  const m = texto?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = "23", mi = "59"] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h + 3, +mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function rssEntries(kind: "llamados" | "adjudicaciones" | "todos", limit: number) {
  const { items, lastBuildDate } = await loadRss();
  const entries = items
    .map((item: any) => {
      const title = text(item.title) || "Sin título";
      const isAdjudicacion = title.toLowerCase().includes("adjudicaci");
      if (kind === "llamados" && isAdjudicacion) return null;
      if (kind === "adjudicaciones" && !isAdjudicacion) return null;
      const description = text(item.description);
      const pubDate = validDate(text(item.pubDate) || undefined, new Date());
      const modDate = kind === "todos" ? pubDate : validDate(lastBuildDate, pubDate);
      // Formato viejo del feed ("Organismo: ...<br>") o actual ("Título - Organismo | Organismo").
      const organismo =
        description.match(/Organismo: (.+?)<br\s*\/?>/)?.[1]?.trim() ||
        (title.includes(" | ") ? title.split(" | ").pop()!.trim() : title.split(" - ").slice(1).join(" - ").trim());
      const cierre =
        description.match(/Fecha Cierre: (.+?)<br\s*\/?>/)?.[1]?.trim() ||
        description.match(/Recepci[oó]n de ofertas hasta: (.+?)(?:<br\s*\/?>|$)/)?.[1]?.trim();
      const entry: Record<string, unknown> = {
        id: text(item.guid) || `no-guid-${Math.random()}`,
        titulo: title,
        link: text(item.link),
        organismo: organismo || "No especificado",
        fecha_cierre_texto: kind === "adjudicaciones" ? "N/A" : cierre || "No especificada",
        fecha_cierre: parseFechaUy(cierre)?.toISOString() ?? null,
        descripcion_completa: description,
        fecha_publicacion: pubDate.toISOString(),
        fecha_modificacion: modDate.toISOString(),
      };
      if (kind === "todos") {
        entry.estado = description.match(/Estado: (.+?)<br>/)?.[1]?.trim() || "No especificado";
        entry.adjudicado = isAdjudicacion;
      }
      return entry;
    })
    .filter(Boolean) as Record<string, any>[];
  // Llamados: solo los vigentes (apertura posterior a ahora). Los que no traen fecha se dejan.
  const vigentes =
    kind === "llamados" ? entries.filter((e) => !e.fecha_cierre || new Date(e.fecha_cierre).getTime() >= Date.now()) : entries;
  const publicado = (e: Record<string, any>) => new Date(e.fecha_publicacion).getTime() || 0;
  if (kind === "llamados") {
    // Apertura más cercana primero; los que no traen fecha van al final (más nuevos primero).
    const apertura = (e: Record<string, any>) => (e.fecha_cierre ? new Date(e.fecha_cierre).getTime() : Infinity);
    vigentes.sort((a, b) => apertura(a) - apertura(b) || publicado(b) - publicado(a));
  } else {
    vigentes.sort((a, b) => publicado(b) - publicado(a));
  }
  return vigentes.slice(0, limit);
}

/** Igual que las funciones originales: los errores del feed vuelven como { error }. */
const rssFunction = (kind: "llamados" | "adjudicaciones" | "todos", key: string, limit: number): Fn => async () => {
  try {
    return { [key]: await rssEntries(kind, limit) };
  } catch (error) {
    console.error(`No se pudo leer el RSS (${kind}):`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

// ---------- IA ----------

/** Ítems leídos de la página del llamado; si la página no responde, se sigue sin ellos. */
async function itemsDelLlamado(llamado: any): Promise<ItemLlamado[] | null> {
  try {
    return await fetchLlamadoItems(llamado?.link);
  } catch (error) {
    console.warn(`No se pudieron leer los ítems de ${llamado?.link}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Hasta cuántos ítems se le pasan a la IA (la lista completa igual se devuelve a la pantalla). */
const MAX_ITEMS_IA = 300;

function itemsParaIA(items: ItemLlamado[] | null): string {
  if (!items?.length) return "";
  const lista = items.slice(0, MAX_ITEMS_IA).map(itemTexto).join("\n");
  const resto = items.length > MAX_ITEMS_IA ? `\n(… y ${items.length - MAX_ITEMS_IA} ítems más)` : "";
  return `\n\nÍtems del llamado según la página de comprasestatales.gub.uy (${items.length} en total):\n${lista}${resto}`;
}

function pliegoTexto(llamado: any, items: ItemLlamado[] | null) {
  if (!llamado || !llamado.titulo || !llamado.descripcion_completa) throw new HttpError(400, "Datos del llamado incompletos.");
  return `
      Título: ${llamado.titulo}
      Organismo: ${llamado.organismo}
      Descripción Completa: ${llamado.descripcion_completa}
    ${itemsParaIA(items)}`;
}

/** Ítem de la página → forma que usa el presupuesto (el texto lleva todo lo necesario para cotizar). */
const itemParaPresupuesto = (item: ItemLlamado) => ({
  // La cantidad va en su propio campo; en el texto queda solo la unidad de medida.
  item: itemTexto(item).replace(/ \| Cantidad: [^|]*?(?= \||$)/, item.unidad ? ` | Unidad: ${item.unidad}` : ""),
  cantidad: item.cantidad ?? 1,
  unidad: item.unidad,
  numero_item: item.numero,
  codigo_articulo: item.codigo_articulo,
  caracteristicas: item.caracteristicas,
  datos: item.datos,
});

const analyzeLlamado: Fn = async ({ llamado }) => {
  if (!llamado?.titulo) throw new HttpError(400, "Datos del llamado incompletos.");
  const items = await itemsDelLlamado(llamado);
  const prompt = await renderPrompt("analizar_llamado", {
    titulo: String(llamado.titulo),
    descripcion: String(llamado.descripcionCompleta ?? llamado.descripcion_completa ?? "") + itemsParaIA(items),
  });
  const result = extractJson<Record<string, any>>(await generateText(prompt), "object");
  if (items?.length) {
    // La lista exacta de la página reemplaza a la que haya deducido la IA.
    result.items_solicitados = items.map((item) => ({
      item: `Ítem ${item.numero}: ${item.nombre}`,
      descripcion: itemTexto(item).split(" | ").slice(1).filter((p) => !p.startsWith("Cantidad:")).join(" · "),
      cantidad: cantidadTexto(item),
    }));
    result.items = items;
    // Lo que se guarda en el llamado para presupuestar después (cantidad numérica exacta).
    result.items_presupuesto = items.map(itemParaPresupuesto);
  }
  return result;
};

const analyzePliego: Fn = async ({ llamado, presupuesto, extract_items_only }) => {
  const items = await itemsDelLlamado(llamado);
  if (extract_items_only) {
    // Con la página del llamado no hace falta la IA: los ítems salen tal cual están publicados.
    if (items?.length) return { items: items.map(itemParaPresupuesto), fuente: "pagina" };
    const result = await generateText(await renderPrompt("extraer_items", { pliego: pliegoTexto(llamado, null) }));
    try {
      return { ...extractJson<Record<string, any>>(result, "object"), fuente: "ia" };
    } catch {
      return { items: [], fuente: "ia" };
    }
  }
  const pliego = pliegoTexto(llamado, items);
  const presupuestoTexto =
    presupuesto?.items?.length > 0
      ? `Presupuesto que hemos preparado:
        ${presupuesto.items.map((item: any) => `- ${item.item}: ${item.cantidad} unidades`).join("\n")}
        Monto total: ${typeof presupuesto.total_presupuesto === "number" ? presupuesto.total_presupuesto.toFixed(2) : "No calculado"}`
      : "No se ha preparado un presupuesto detallado todavía.";

  let analysisText: string;
  let proposal: string;
  try {
    [analysisText, proposal] = await Promise.all([
      renderPrompt("analisis_pliego", { pliego }).then(generateText),
      renderPrompt("propuesta_tecnica", { pliego, presupuesto: presupuestoTexto }).then(generateText),
    ]);
  } catch (error) {
    // Si la IA falla pero ya tenemos los ítems de la página, igual se muestran.
    if (!items?.length) throw error;
    console.warn("Análisis de IA falló; se devuelven solo los ítems:", error instanceof Error ? error.message : error);
    return { analysis: null, proposal: "", items, ai_error: error instanceof Error ? error.message : String(error) };
  }
  let analysis: unknown = {};
  try {
    analysis = extractJson(analysisText, "object");
  } catch {
    analysis = {};
  }
  return { analysis, proposal, items: items ?? [] };
};

const analyzeTextBudget: Fn = async ({ plainText, clienteId, allProducts, budgetMoneda }) => {
  if (!plainText || !clienteId || !Array.isArray(allProducts) || !budgetMoneda) throw new HttpError(400, "Faltan datos para el análisis.");
  const catalogo = allProducts.map((p: any) => `ID: ${p.id}, Nombre: ${p.nombre}, Código: ${p.codigo || "N/A"}`).join("\n");
  const parsed = extractJson<any[]>(await generateText(await renderPrompt("pedido_texto", { pedido: String(plainText), catalogo })), "array");

  const items = await Promise.all(
    parsed.map(async (item: any) => {
      const producto = allProducts.find((p: any) => p.id === item.producto_id);
      if (!producto) return null;
      let precio = 0;
      let iva = 22;
      let moneda = "UYU";

      const [clientPrice] = await querySql<any>(
        "SELECT precio_unitario, iva, moneda FROM precios_cliente WHERE cliente_id = ? AND producto_id = ? LIMIT 1",
        [clienteId, item.producto_id],
      );
      if (clientPrice && (clientPrice.moneda || "UYU") === budgetMoneda) {
        precio = clientPrice.precio_unitario;
        iva = clientPrice.iva;
        moneda = clientPrice.moneda;
      } else {
        const history = await querySql<any>(
          "SELECT items, moneda FROM presupuestos_clientes WHERE cliente_id = ? AND moneda = ? ORDER BY created_at DESC",
          [clienteId, budgetMoneda],
        );
        for (const presupuesto of history) {
          let list: any[] = [];
          try {
            list = JSON.parse(presupuesto.items ?? "[]");
          } catch {
            /* ignorar */
          }
          const found = list.find((i) => i.producto_id === item.producto_id);
          if (found?.precio_unitario) {
            precio = found.precio_unitario;
            iva = found.iva;
            moneda = presupuesto.moneda;
            break;
          }
        }
      }
      if (precio === 0 && producto.precio_unitario && (producto.moneda || "UYU") === budgetMoneda) {
        precio = producto.precio_unitario;
        iva = producto.iva || 22;
        moneda = producto.moneda || "UYU";
      }
      if ((moneda || "UYU") !== budgetMoneda) return null;
      return {
        id: Date.now() + Math.random(),
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: precio,
        iva,
        moneda,
      };
    }),
  );
  return items.filter(Boolean);
};

const analyzeExcelImport: Fn = async ({ fileContentJson }) => {
  if (!Array.isArray(fileContentJson) || fileContentJson.length === 0) throw new HttpError(400, "El contenido del archivo está vacío.");
  const datos = JSON.stringify(fileContentJson.slice(0, 20));
  const parsed = extractJson<any[]>(await generateText(await renderPrompt("importar_excel", { datos })), "array");
  return parsed
    .map((item) => {
      const m = typeof item.moneda === "string" ? item.moneda.toUpperCase() : "";
      return {
        ...item,
        cuit: item.cuit ? String(item.cuit).replace(/[^0-9]/g, "") : null,
        precioUnitario: item.precioUnitario
          ? parseFloat(String(item.precioUnitario).replace(/[^0-9.,-]/g, "").replace(",", "."))
          : 0,
        iva: item.iva !== undefined && [22, 10, 0].includes(parseInt(item.iva)) ? parseInt(item.iva) : 22,
        moneda: m.includes("USD") || m.includes("U$") || m.includes("DOL") ? "USD" : "UYU",
      };
    })
    .filter((item) => item.cuit && item.codigo && item.precioUnitario > 0);
};

const FUNCTIONS: Record<string, Fn> = {
  // Todos los vigentes del feed, sin tope.
  "fetch-llamados-rss": rssFunction("llamados", "llamados", Infinity),
  "fetch-adjudicaciones-rss": rssFunction("adjudicaciones", "adjudicaciones", 150),
  "fetch-rss": rssFunction("todos", "llamados", 300),
  "analyze-llamado": analyzeLlamado,
  "analyze-pliego": analyzePliego,
  "analyze-text-budget": analyzeTextBudget,
  "analyze-excel-import": analyzeExcelImport,
};

// ---------- Ejecución con espera corta + consulta ----------

// El estado de cada pedido se guarda en la tabla function_jobs (no en memoria): Hostinger
// corre varios procesos de la app y la consulta del navegador puede caer en otro proceso.
type JobStatus = "pending" | "done" | "error";
type Job = { status: JobStatus; data?: unknown; error?: string; code?: number };
const WAIT_MS = Number(process.env.FUNCTION_WAIT_MS) || 20 * 1000;
/** Un pedido "pending" más viejo que esto se da por perdido (el proceso que lo corría se cerró). */
const STALE_MS = 12 * 60 * 1000;

function finishedResponse(job: Job) {
  if (job.status === "error") return { status: job.code || 500, body: { status: "error", error: { message: job.error } } };
  return { status: 200, body: { status: "done", data: job.data ?? null } };
}

async function saveJob(id: string, job: Job) {
  await getPool().query("UPDATE function_jobs SET status = ?, data = ?, error = ?, code = ? WHERE id = ?", [
    job.status,
    job.status === "done" ? JSON.stringify(job.data ?? null) : null,
    job.error ?? null,
    job.code ?? null,
    id,
  ]);
}

export function functionsRouter() {
  const router = express.Router();
  router.use(loadSession, requireUser);

  router.post("/:name", wrap(async (req: AuthedRequest, res) => {
    const fn = Object.hasOwn(FUNCTIONS, req.params.name) ? FUNCTIONS[req.params.name] : undefined;
    if (!fn) throw new HttpError(404, `Función desconocida: ${req.params.name}`);
    const db = getPool();
    const id = randomUUID();
    // Limpieza de pedidos viejos, de paso.
    await db.query("DELETE FROM function_jobs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR");
    await db.query("INSERT INTO function_jobs (id, user_id, status, created_at) VALUES (?, ?, 'pending', UTC_TIMESTAMP())", [
      id,
      req.user!.id,
    ]);
    const job: Job = { status: "pending" };
    const done = fn(req.body ?? {}, req.user!)
      .then((data) => {
        job.status = "done";
        job.data = data;
      })
      .catch((error) => {
        if (!(error instanceof HttpError)) console.error(`Error en la función ${req.params.name} (IA: ${aiProvider()}):`, error);
        job.status = "error";
        job.code = error instanceof HttpError || error instanceof AiError ? error.status : 500;
        job.error = error instanceof Error ? error.message : String(error);
      })
      .then(() => saveJob(id, job))
      .catch((error) => console.error(`No se pudo guardar el resultado de ${req.params.name}:`, error));
    await Promise.race([done, new Promise((r) => setTimeout(r, WAIT_MS))]);
    if (job.status === "pending") return res.status(202).json({ status: "pending", id });
    await done; // el resultado ya está; nos aseguramos de no dejar la fila a medio guardar
    await db.query("DELETE FROM function_jobs WHERE id = ?", [id]);
    const { status, body } = finishedResponse(job);
    res.status(status).json(body);
  }));

  router.get("/jobs/:id", wrap(async (req: AuthedRequest, res) => {
    const db = getPool();
    const [rows] = await db.query<any[]>(
      "SELECT status, data, error, code, TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age FROM function_jobs WHERE id = ? AND user_id = ?",
      [req.params.id, req.user!.id],
    );
    const row = rows[0];
    if (!row || (row.status === "pending" && row.age * 1000 > STALE_MS)) {
      if (row) await db.query("DELETE FROM function_jobs WHERE id = ?", [req.params.id]);
      console.warn(`Pedido ${req.params.id} no encontrado o vencido.`);
      throw new HttpError(404, "El pedido se perdió (el servidor pudo haberse reiniciado). Probá de nuevo.");
    }
    if (row.status === "pending") return res.status(202).json({ status: "pending", id: req.params.id });
    await db.query("DELETE FROM function_jobs WHERE id = ?", [req.params.id]);
    const job: Job = {
      status: row.status,
      data: row.data == null ? null : JSON.parse(row.data),
      error: row.error ?? undefined,
      code: row.code ?? undefined,
    };
    const { status, body } = finishedResponse(job);
    res.status(status).json(body);
  }));

  router.use(apiErrorHandler);
  return router;
}
