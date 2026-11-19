// Lee los ítems de la página de un llamado en comprasestatales.gub.uy
// (bloque "Ítems del llamado", a la derecha): número, nombre, código de artículo,
// cantidad y unidad, otros datos (ej. moneda) y la tabla de características.
// Si hay más de 100 ítems, el sitio los pagina en /consultas/items/page/N/id/ID, y
// esas páginas solo responden con la cookie de sesión que deja la página del llamado.

const BASE = "https://www.comprasestatales.gub.uy";
const MAX_PAGES = 50;
const CACHE_MS = 10 * 60 * 1000;

export interface Dato {
  nombre: string;
  valor: string;
}

export interface ItemLlamado {
  numero: string;
  nombre: string;
  codigo_articulo: string | null;
  cantidad: number | null;
  unidad: string | null;
  /** Otros datos de la línea de cantidad, por ejemplo la moneda. */
  datos: Dato[];
  caracteristicas: Dato[];
}

const cache = new Map<string, { at: number; items: ItemLlamado[] }>();

/** Id del llamado a partir del link guardado (…/consultas/detalle/id/1382914). */
export function llamadoIdFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!/(^|\.)comprasestatales\.gub\.uy$/i.test(url.hostname)) return null;
  return url.pathname.match(/\/consultas\/detalle\/id\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", sol: "/", ordm: "º", ordf: "ª", deg: "°",
  laquo: "«", raquo: "»", ndash: "–", mdash: "—", iexcl: "¡", iquest: "¿", middot: "·", frac12: "½",
};
const ACCENTS: Record<string, string> = { acute: "́", grave: "̀", tilde: "̃", uml: "̈", circ: "̂" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    if (NAMED[e]) return NAMED[e];
    const accent = e.match(/^([a-z])(acute|grave|tilde|uml|circ)$/i);
    if (accent) return (accent[1] + ACCENTS[accent[2].toLowerCase()]).normalize("NFC");
    if (e === "ccedil") return "ç";
    if (e === "Ccedil") return "Ç";
    return m;
  });
}

/** Texto plano de un fragmento HTML. */
const clean = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** "4.748.267,00 DETERMINACION" → { cantidad: 4748267, unidad: "DETERMINACION" } */
function parseCantidad(texto: string): { cantidad: number | null; unidad: string | null } {
  const m = texto.match(/^([\d.]+(?:,\d+)?)\s*(.*)$/);
  if (!m) return { cantidad: null, unidad: texto || null };
  const cantidad = Number(m[1].replace(/\./g, "").replace(",", "."));
  return { cantidad: Number.isFinite(cantidad) ? cantidad : null, unidad: m[2].trim() || null };
}

export function parseItems(html: string): ItemLlamado[] {
  const items: ItemLlamado[] = [];
  const blocks = html.split(/<div class="desc-item">/).slice(1);
  for (const raw of blocks) {
    // El bloque de un ítem termina donde empieza el siguiente o la paginación.
    const block = raw.split(/paginator-items|id="pagination"/)[0];
    const h3 = block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "";
    const numero = clean(h3.match(/buy-item-title-small">([\s\S]*?)<\/span>/)?.[1] ?? "")
      .replace(/^[ÍI]tem\s*N[º°o]?\s*/i, "")
      .trim();
    const codigoRaw = clean(h3.match(/class="cod-art">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const codigo = codigoRaw.match(/Art[ií]culo\s*([^)]+)\)?/i)?.[1]?.trim() || null;
    const nombre = clean(
      h3.replace(/<span class="buy-item-title-small">[\s\S]*?<\/span>/, "").replace(/<span class="cod-art">[\s\S]*?<\/span>/, ""),
    );

    // Línea "Cantidad: 2,00 UNIDAD  Moneda: Pesos Uruguayos": pares etiqueta/valor.
    const datos: Dato[] = [];
    let cantidad: number | null = null;
    let unidad: string | null = null;
    const ul = block.match(/<ul class="list-inline"[\s\S]*?<\/ul>/)?.[0] ?? "";
    const lis = [...ul.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]));
    for (let i = 0; i < lis.length; i++) {
      if (!lis[i].endsWith(":")) continue;
      const etiqueta = lis[i].slice(0, -1).trim();
      const valor = lis[i + 1] ?? "";
      i++;
      if (/^cantidad$/i.test(etiqueta)) ({ cantidad, unidad } = parseCantidad(valor));
      else if (valor) datos.push({ nombre: etiqueta, valor });
    }

    // Tabla de características (no siempre está).
    const caracteristicas: Dato[] = [];
    const table = block.match(/<table class="table features-table">[\s\S]*?<\/table>/)?.[0] ?? "";
    for (const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]));
      if (tds.length >= 2 && (tds[0] || tds[1])) caracteristicas.push({ nombre: tds[0], valor: tds.slice(1).join(" ") });
    }

    if (!numero && !nombre) continue;
    items.push({ numero, nombre, codigo_articulo: codigo, cantidad, unidad, datos, caracteristicas });
  }
  return items;
}

/** Número de la última página de ítems (1 si no hay paginación). */
function lastPage(html: string, id: string): number {
  const re = new RegExp(`/consultas/items/page/(\\d+)/id/${id}\\b`, "g");
  let max = 1;
  for (const m of html.matchAll(re)) max = Math.max(max, Number(m[1]));
  return Math.min(max, MAX_PAGES);
}

async function getPage(url: string, cookies: Map<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ComprasuyApp/1.0)",
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(25_000),
  });
  for (const c of response.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  if (response.status !== 200) throw new Error(`comprasestatales.gub.uy respondió ${response.status} para ${url}`);
  return response.text();
}

/**
 * Todos los ítems del llamado, leyendo todas sus páginas. Devuelve null si el link no es
 * de comprasestatales.gub.uy. Los errores de red se propagan para que quien llame decida.
 */
export async function fetchLlamadoItems(link: unknown): Promise<ItemLlamado[] | null> {
  const id = llamadoIdFromLink(link);
  if (!id) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const cookies = new Map<string, string>();
  const first = await getPage(`${BASE}/consultas/detalle/id/${id}`, cookies);
  const items = parseItems(first);
  const pages = lastPage(first, id);
  for (let page = 2; page <= pages; page++) {
    items.push(...parseItems(await getPage(`${BASE}/consultas/items/page/${page}/id/${id}`, cookies)));
  }
  cache.set(id, { at: Date.now(), items });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return items;
}

/** "2 UNIDAD", "4.748.267 DETERMINACION" */
export function cantidadTexto(item: ItemLlamado): string {
  if (item.cantidad == null) return item.unidad ?? "";
  return `${item.cantidad.toLocaleString("es-UY")}${item.unidad ? ` ${item.unidad}` : ""}`;
}

/** Una línea con todo lo necesario para presupuestar ese ítem. */
export function itemTexto(item: ItemLlamado): string {
  const partes = [`Ítem ${item.numero}: ${item.nombre}`];
  if (item.codigo_articulo) partes.push(`Cód. artículo ${item.codigo_articulo}`);
  partes.push(`Cantidad: ${cantidadTexto(item) || "no indicada"}`);
  for (const d of item.datos) partes.push(`${d.nombre}: ${d.valor}`);
  if (item.caracteristicas.length) {
    partes.push(`Características: ${item.caracteristicas.map((c) => (c.nombre ? `${c.nombre}: ${c.valor}` : c.valor)).join("; ")}`);
  }
  return partes.join(" | ");
}
