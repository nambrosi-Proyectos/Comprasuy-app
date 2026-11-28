import { hash, hoyISO } from './pagos.js';

// ---------- Constantes ----------

export const CATEGORIAS = ['Alimentos', 'Limpieza', 'Papelería', 'Otros'];
export const UNIDADES = ['unidad', 'caja', 'paquete', 'kilo', 'bolsa', 'bidón', 'litro', 'fardo', 'pallet'];

export const TIPOS_UBICACION = {
  sala: 'Sala',
  gondola: 'Góndola',
  proveedor: 'Depósito de proveedor',
  sin_ubicar: 'Sin ubicar',
};

export const TIPOS_MOVIMIENTO = {
  conteo: 'Conteo',
  entrada: 'Entrada',
  salida: 'Salida',
  traslado: 'Traslado',
  ajuste: 'Ajuste',
};

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Nombres ----------

/** Clave para reconocer el mismo producto escrito distinto: "AZUCAR  Azucarlito" = "azúcar azucarlito". */
export const claveProducto = (nombre) =>
  sinTildes(nombre)
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9ñ. ]+/g, ' ')
    .replace(/\s+\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Para comparar nombres: sin "de/del/x…", con unidades iguales (kilo = kg = k, litro = l, gramos = g) y sin importar el orden.
const SOBRAN = new Set(['de', 'del', 'la', 'el', 'en', 'x', 'y', 'con', 'por', 'a', 'al']);
export const claveComparable = (nombre) => {
  const t = claveProducto(nombre)
    .replace(/(\d)\s*(kilos?|kgs?|k)\b/g, '$1 kg').replace(/\b(kilos?|kgs?)\b/g, 'kg')
    .replace(/(\d)\s*(litros?|lts?|l)\b/g, '$1 l').replace(/\blitros?\b/g, 'l')
    .replace(/(\d)\s*(gramos?|grs?|g)\b/g, '$1 g')
    .replace(/(\d)\s*(ml|cc)\b/g, '$1 ml');
  return [...new Set(t.split(' ').filter((w) => w && !SOBRAN.has(w)))].sort().join(' ');
};

/** Pares de productos que parecen el mismo (para revisarlos y unirlos a mano). */
export const posiblesDuplicados = (productos, max = 150) => {
  const lista = productos.filter((p) => p.activo !== false).map((p) => {
    const c = claveComparable(p.nombre);
    return { p, c, tokens: new Set(c.split(' ')), nums: numeros(c) };
  });
  const pares = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.nums !== b.nums) continue;
      let comunes = 0;
      for (const t of a.tokens) if (b.tokens.has(t)) comunes++;
      const sim = comunes / Math.max(a.tokens.size, b.tokens.size);
      const igual = a.c === b.c || parecidos(a.c, b.c);
      if (igual || (sim >= 0.6 && comunes >= 2)) pares.push({ a: a.p, b: b.p, sim: igual ? 1 : sim });
    }
  }
  return pares.sort((x, y) => y.sim - x.sim).slice(0, max);
};

const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'en', 'x', 'y', 'con', 'sin', 'para', 'a', 'al', 'por']);

/** "PULPA DE TOMATE don perita" → "Pulpa de Tomate Don Perita". */
export const nombreProducto = (nombre) =>
  String(nombre ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => {
      const l = w.toLowerCase();
      if (i > 0 && MINUSCULAS.has(l)) return l;
      if (/\d/.test(w)) return l; // 500g, 2,5k, 10L
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join(' ');

const distancia = (a, b) => {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

const numeros = (clave) => (clave.match(/\d+(\.\d+)?/g) || []).join('|');

/** Dos nombres que casi seguro son el mismo producto ("azucr azucarlito" / "azucar azucarlito"). */
export const parecidos = (a, b) => {
  if (a === b) return true;
  if (numeros(a) !== numeros(b)) return false;
  const largo = Math.min(a.length, b.length);
  if (largo < 8) return false;
  return distancia(a, b) <= (largo >= 14 ? 2 : 1);
};

// ---------- Ubicaciones ----------

/** Nombre completo: "Sala 1 › Góndola A". */
export const nombreUbicacion = (u, porId) => {
  if (!u) return '—';
  const padre = u.padre_id && porId?.get(u.padre_id);
  return padre ? `${padre.nombre} › ${u.nombre}` : u.nombre;
};

export const esAfuera = (u) => u?.tipo === 'proveedor';

/** Salas con sus góndolas debajo, después proveedores y al final "Sin ubicar". */
export const ubicacionesOrdenadas = (ubicaciones) => {
  const activas = ubicaciones.filter((u) => u.activo !== false);
  const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true });
  const salas = activas.filter((u) => u.tipo === 'sala').sort(porOrden);
  const out = [];
  for (const s of salas) {
    out.push({ ...s, nivel: 0 });
    for (const g of activas.filter((u) => u.tipo === 'gondola' && u.padre_id === s.id).sort(porOrden)) out.push({ ...g, nivel: 1 });
  }
  const huerfanas = activas.filter((u) => u.tipo === 'gondola' && !salas.some((s) => s.id === u.padre_id)).sort(porOrden);
  out.push(...huerfanas.map((g) => ({ ...g, nivel: 0 })));
  out.push(...activas.filter((u) => u.tipo === 'proveedor').sort(porOrden).map((u) => ({ ...u, nivel: 0 })));
  out.push(...activas.filter((u) => u.tipo === 'sin_ubicar').map((u) => ({ ...u, nivel: 0 })));
  return out;
};

// ---------- Cálculo del stock ----------

const ordenMov = (a, b) =>
  String(a.fecha).localeCompare(String(b.fecha)) ||
  String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
  (a.tipo === 'conteo' ? -1 : 0) - (b.tipo === 'conteo' ? -1 : 0);

/**
 * Stock por producto y lugar: el último conteo de ese producto en ese lugar más las entradas,
 * salidas y traslados posteriores. Devuelve Map "producto|ubicacion" → { cantidad, ultimoConteo, ultimoMov }.
 */
export const saldosStock = (movimientos) => {
  const saldos = new Map();
  for (const m of [...movimientos].sort(ordenMov)) {
    const k = `${m.producto_id}|${m.ubicacion_id}`;
    const s = saldos.get(k) || { producto_id: m.producto_id, ubicacion_id: m.ubicacion_id, cantidad: 0, ultimoConteo: null, ultimoMov: null };
    const n = Number(m.cantidad) || 0;
    if (m.tipo === 'conteo') {
      s.cantidad = n;
      s.ultimoConteo = m.fecha;
    } else s.cantidad += n;
    s.ultimoMov = m.fecha;
    // Si se llevó todo a otro lugar, el producto deja de estar asignado acá.
    s.seFue = m.tipo === 'traslado' && (n < 0 || m.referencia === 'sale') && Math.abs(s.cantidad) < 0.0005;
    saldos.set(k, s);
  }
  for (const s of saldos.values()) {
    s.cantidad = Math.round(s.cantidad * 1000) / 1000;
    s.asignado = !s.seFue;
  }
  return saldos;
};

/** Stock de cada producto: adentro, afuera, total, valor y en qué lugares está. */
export const resumenStock = (productos, ubicaciones, movimientos) => {
  const ubicPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const saldos = saldosStock(movimientos);
  const porProducto = new Map(productos.map((p) => [p.id, { producto: p, dentro: 0, afuera: 0, total: 0, valor: 0, lugares: [], ultimoConteo: null }]));
  for (const s of saldos.values()) {
    const r = porProducto.get(s.producto_id);
    const u = ubicPorId.get(s.ubicacion_id);
    if (!r || !u) continue;
    if (s.ultimoConteo && (!r.ultimoConteo || s.ultimoConteo > r.ultimoConteo)) r.ultimoConteo = s.ultimoConteo;
    // Con 0 igual queda en la lista si el producto está asignado a ese lugar (salvo "Sin ubicar").
    if (Math.abs(s.cantidad) < 0.0005 && (!s.asignado || u.tipo === 'sin_ubicar')) continue;
    r.lugares.push({ ubicacion: u, cantidad: s.cantidad, ultimoConteo: s.ultimoConteo });
    if (esAfuera(u)) r.afuera += s.cantidad;
    else r.dentro += s.cantidad;
  }
  for (const r of porProducto.values()) {
    r.total = r.dentro + r.afuera;
    r.valor = r.total * (Number(r.producto.costo) || 0);
    r.valorDentro = r.dentro * (Number(r.producto.costo) || 0);
    r.valorAfuera = r.afuera * (Number(r.producto.costo) || 0);
    const min = Number(r.producto.stock_minimo);
    r.bajoMinimo = r.producto.activo !== false && min > 0 && r.total < min;
    r.lugares.sort((a, b) => b.cantidad - a.cantidad);
  }
  return [...porProducto.values()];
};

/** Lo que hay hoy en un lugar: producto → cantidad. */
export const contenidoUbicacion = (ubicacionId, movimientos) => {
  const out = new Map();
  for (const s of saldosStock(movimientos.filter((m) => m.ubicacion_id === ubicacionId)).values()) out.set(s.producto_id, s);
  return out;
};

export const totalesStock = (resumen) =>
  resumen.reduce(
    (a, r) => ({
      valorDentro: a.valorDentro + r.valorDentro,
      valorAfuera: a.valorAfuera + r.valorAfuera,
      bajoMinimo: a.bajoMinimo + (r.bajoMinimo ? 1 : 0),
      conStock: a.conStock + (r.total > 0 ? 1 : 0),
    }),
    { valorDentro: 0, valorAfuera: 0, bajoMinimo: 0, conStock: 0 },
  );

/** Foto del stock para el cierre del mes. */
export const itemsCierre = (resumen) =>
  resumen
    .filter((r) => Math.abs(r.total) > 0.0005)
    .map((r) => ({ p: r.producto.id, d: r.dentro, a: r.afuera, c: Number(r.producto.costo) || 0 }));

export const valorCierre = (items) =>
  items.reduce((a, it) => ({ dentro: a.dentro + it.d * (it.c || 0), afuera: a.afuera + (it.va ?? it.a * (it.c || 0)) }), { dentro: 0, afuera: 0 });

export const formatoCantidad = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('es-UY', { maximumFractionDigits: 2 });
};

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => {
  const [y, m] = String(mes).split('-').map(Number);
  return `${NOMBRES_MES[m - 1] || '?'} ${y}`;
};

const ultimoDia = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
export const finDeMes = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return ultimoDia(y, m);
};

// ---------- Planilla "STOCK DEPOSITO" ----------

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 };

/** "mayo 26" / "afuera may26" / "setiembre 26" → { mes: '2026-05', afuera } */
export const mesDeHoja = (nombre) => {
  const t = sinTildes(nombre).toLowerCase().trim();
  const m = t.match(/^(afuera\s*)?([a-z]+)\s*(\d{2,4})$/);
  if (!m) return null;
  const num = MESES[m[2].slice(0, 3)];
  if (!num) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return { mes: `${y}-${String(num).padStart(2, '0')}`, afuera: !!m[1] };
};

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = texto(v).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const n = parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const categoriaDe = (t) => {
  const c = sinTildes(t).toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (/^aliment/.test(c)) return 'Alimentos';
  if (/^limp/.test(c)) return 'Limpieza';
  if (/^papeler/.test(c)) return 'Papelería';
  return null;
};

/** "stock de diez" → "Diez"; "PURITAS" → "Puritas". */
const nombreDepositoProveedor = (t) => nombreProducto(sinTildes(t).toLowerCase().replace(/^stock\s+(de\s+)?/, '').trim());

const filasHoja = (XLSX, ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

/** Hoja mensual del depósito propio: NOMBRE | CANTIDAD | stock minimo | $ compra | $ total | … | Columna1 */
const leerHojaDeposito = (XLSX, ws) => {
  const filas = filasHoja(XLSX, ws);
  const iHead = filas.findIndex((r) => r.some((c) => /^nombre$/i.test(texto(c))) && r.some((c) => /^cantidad$/i.test(texto(c))));
  if (iHead < 0) return [];
  const head = filas[iHead].map((c) => sinTildes(texto(c)).toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const cN = col(/^nombre$/);
  const cC = col(/^cantidad$/);
  const cMin = col(/minimo/);
  const cP = col(/compra/);
  const cT = col(/total/);
  const cS = col(/^saldo$/);
  const cNotas = head.map((h, i) => i).filter((i) => i > Math.max(cS, cT, cP));
  let categoria = 'Papelería';
  const out = [];
  for (const r of filas.slice(iHead + 1)) {
    const nombre = texto(r[cN]);
    if (!nombre || /^total\b/i.test(nombre)) continue;
    const cant = numero(r[cC]);
    const min = cMin >= 0 ? numero(r[cMin]) : null;
    const costo = cP >= 0 ? numero(r[cP]) : null;
    if (cant === null && min === null && costo === null && categoriaDe(nombre)) {
      categoria = categoriaDe(nombre);
      continue;
    }
    const notas = cNotas.map((i) => texto(r[i])).filter((t) => t && !/^\d+([.,]\d+)?$/.test(t)).join(' · ');
    out.push({ nombre, categoria, cantidad: cant ?? 0, stock_minimo: min, costo: costo && costo > 0 ? costo : null, notas: notas || null });
  }
  return out;
};

/** Hoja "afuera": nombre | $ | cantidad | fecha | salida | saldo, con el proveedor como título de cada bloque. */
const leerHojaAfuera = (XLSX, ws) => {
  const filas = filasHoja(XLSX, ws);
  const iHead = filas.findIndex((r) => r.some((c) => /^nombre$/i.test(texto(c))));
  if (iHead < 0) return [];
  const head = filas[iHead].map((c) => sinTildes(texto(c)).toLowerCase());
  const cN = head.indexOf('nombre');
  const cV = head.indexOf('$');
  const cC = head.indexOf('cantidad');
  const cS = head.indexOf('saldo');
  let proveedor = null;
  const out = [];
  for (const r of filas.slice(iHead + 1)) {
    const nombre = texto(r[cN]);
    const titulo = texto(r[cV]);
    if (!nombre && titulo && numero(titulo) === null) {
      proveedor = nombreDepositoProveedor(titulo);
      continue;
    }
    if (!nombre || /^total$/i.test(nombre) || !proveedor) continue;
    out.push({ nombre, proveedor, valor: numero(r[cV]), cantidad: numero(r[cC]), saldo: numero(r[cS]) });
  }
  return out;
};

/**
 * Lee el libro "STOCK DEPOSITO": una hoja por mes del depósito propio y otra "afuera …" por mes
 * con lo guardado en depósitos de proveedores.
 * Devuelve productos (con sus nombres anteriores), depósitos de proveedores, cierres mensuales
 * y el stock del último mes para arrancar.
 */
export function leerPlanillaStock(XLSX, wb, hoy = hoyISO()) {
  const hojas = [];
  for (const nombre of wb.SheetNames) {
    const info = mesDeHoja(nombre);
    if (info) hojas.push({ nombre, ...info });
  }
  if (!hojas.length) throw new Error('No encontré hojas mensuales (por ejemplo "nov 26" o "afuera nov 26").');
  hojas.sort((a, b) => a.mes.localeCompare(b.mes) || Number(a.afuera) - Number(b.afuera));

  // 1) Leer todas las filas.
  const filas = []; // { mes, afuera, nombre, clave, ... }
  for (const h of hojas) {
    const ws = wb.Sheets[h.nombre];
    const lista = h.afuera ? leerHojaAfuera(XLSX, ws) : leerHojaDeposito(XLSX, ws);
    for (const f of lista) filas.push({ ...f, mes: h.mes, afuera: h.afuera, clave: claveProducto(f.nombre) });
  }

  // 2) Unir nombres parecidos en un solo producto (el nombre que queda es el más reciente).
  const claves = [...new Set(filas.map((f) => f.clave))].filter(Boolean);
  const raiz = new Map(claves.map((c) => [c, c]));
  const buscar = (c) => (raiz.get(c) === c ? c : buscar(raiz.get(c)));
  for (let i = 0; i < claves.length; i++) {
    for (let j = i + 1; j < claves.length; j++) {
      if (parecidos(claves[i], claves[j])) raiz.set(buscar(claves[j]), buscar(claves[i]));
    }
  }
  const productos = new Map(); // raíz → producto
  for (const f of filas) {
    if (!f.clave) continue;
    const r = buscar(f.clave);
    const p = productos.get(r) || { alias: new Set(), categoria: f.afuera ? 'Alimentos' : f.categoria };
    p.alias.add(f.clave);
    p.nombre = nombreProducto(f.nombre);
    p.clave = f.clave;
    if (!f.afuera) {
      p.dentro = true;
      p.categoria = f.categoria;
      if (f.stock_minimo != null) p.stock_minimo = f.stock_minimo;
      if (f.costo) p.costo = f.costo;
      if (f.notas) p.notas = f.notas;
    } else if (!p.dentro && f.valor && f.cantidad) p.costo = Math.round((f.valor / f.cantidad) * 100) / 100; // costo del último mes
    productos.set(r, p);
  }
  for (const f of filas) f.raiz = f.clave ? buscar(f.clave) : null;

  // 3) Depósitos de proveedores.
  const proveedores = [...new Set(filas.filter((f) => f.afuera).map((f) => f.proveedor))];

  // 4) Cierres por mes.
  const meses = [...new Set(hojas.map((h) => h.mes))].sort();
  const cierres = [];
  const previoAfuera = new Map(); // raíz|proveedor → { cantidad, valor }
  const actualAfuera = new Map(); // del último mes con hoja "afuera"
  for (const mes of meses) {
    const items = new Map();
    const item = (raiz) => {
      if (!items.has(raiz)) items.set(raiz, { clave: raiz, d: 0, a: 0, c: 0, va: 0, lugares: {} });
      return items.get(raiz);
    };
    for (const f of filas.filter((x) => x.mes === mes && x.raiz)) {
      const it = item(f.raiz);
      if (!f.afuera) {
        it.d += f.cantidad;
        if (f.costo) it.c = f.costo;
        continue;
      }
      let cantidad = f.cantidad;
      let valor = f.valor;
      const k = `${f.raiz}|${f.proveedor}`;
      if (cantidad == null) {
        // Sin cantidad: si el saldo coincide con la plata del mes anterior, es lo mismo que había.
        const prev = previoAfuera.get(k);
        if (prev && f.saldo != null && Math.abs(f.saldo - (prev.valor || 0)) < 1) ({ cantidad, valor } = prev);
      }
      if (!cantidad) continue;
      it.a += cantidad;
      it.va += valor || 0;
      if (!it.c && valor) it.c = Math.round((valor / cantidad) * 100) / 100;
      it.lugares[f.proveedor] = (it.lugares[f.proveedor] || 0) + cantidad;
      previoAfuera.set(k, { cantidad, valor });
    }
    const conAfuera = hojas.some((h) => h.mes === mes && h.afuera);
    const conDentro = hojas.some((h) => h.mes === mes && !h.afuera);
    const lista = [...items.values()].filter((it) => it.d || it.a);
    cierres.push({
      mes,
      fecha: finDeMes(mes),
      items: lista,
      valor_dentro: Math.round(lista.reduce((a, it) => a + it.d * (it.c || 0), 0) * 100) / 100,
      valor_afuera: Math.round(lista.reduce((a, it) => a + (it.va || 0), 0) * 100) / 100,
      nota: [!conDentro && 'sin hoja del depósito', !conAfuera && 'sin hoja de afuera'].filter(Boolean).join(' · ') || null,
      conDentro,
      conAfuera,
    });
    if (conAfuera) {
      actualAfuera.clear();
      for (const it of lista) for (const [prov, cant] of Object.entries(it.lugares)) actualAfuera.set(`${it.clave}|${prov}`, cant);
    }
  }

  // 5) Stock para arrancar: el último mes del depósito (en "Sin ubicar") y el último mes de afuera.
  const ultDentro = [...cierres].reverse().find((c) => c.conDentro);
  const ultAfuera = [...cierres].reverse().find((c) => c.conAfuera);
  const fechaConteo = (mes) => (finDeMes(mes) > hoy ? hoy : finDeMes(mes));
  const inicial = [];
  if (ultDentro) {
    for (const it of ultDentro.items) {
      if (it.d > 0) inicial.push({ clave: it.clave, ubicacion: null, cantidad: it.d, fecha: fechaConteo(ultDentro.mes), import_key: `stk-${hash(`${ultDentro.mes}|dentro|${it.clave}`)}` });
    }
  }
  if (ultAfuera) {
    for (const [k, cantidad] of actualAfuera) {
      const [clave, proveedor] = k.split('|');
      inicial.push({ clave, ubicacion: proveedor, cantidad, fecha: fechaConteo(ultAfuera.mes), import_key: `stk-${hash(`${ultAfuera.mes}|${proveedor}|${clave}`)}` });
    }
  }

  return {
    hojas: hojas.map((h) => h.nombre),
    productos: [...productos.entries()].map(([raiz, p]) => ({
      raiz, clave: p.clave, nombre: p.nombre, categoria: p.categoria || 'Otros', unidad: null,
      stock_minimo: p.stock_minimo ?? null, costo: p.costo ?? null, notas: p.notas || null, alias: [...p.alias].sort(),
    })),
    proveedores,
    cierres,
    inicial,
    raizDe: (clave) => buscar(clave),
  };
}
