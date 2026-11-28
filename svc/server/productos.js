// Productos de SVC sobre el catálogo único del sistema (fases 2 y 3 de la unificación).
//  - stock_productos: el producto físico (nombre, categoría, unidad, costo, mínimo). Es el mismo del módulo Stock.
//  - precios_lista: un renglón por producto y lista (comercio, institución, REMAR) con código, precio, IVA e imagen.
//    Su id es el "productId" de SVC, así las ventas viejas siguen apuntando bien.
//  - El stock es el del módulo Stock (conteos y movimientos por sala, góndola y "Sin ubicar"), sin contar
//    lo que está en depósitos de proveedores. Cada venta de SVC genera salidas; anularla devuelve la mercadería.
const crypto = require('crypto');

// ---------- nombres (igual que src/lib/stock.js) ----------
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const claveProducto = (nombre) =>
  sinTildes(nombre).toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9ñ. ]+/g, ' ')
    .replace(/\s+\./g, ' ').replace(/\s+/g, ' ').trim();
// Para comparar nombres: sin "de/del/x…", con unidades iguales (kilo = kg = k, litro = l, gramos = g) y sin importar el orden.
const SOBRAN = new Set(['de', 'del', 'la', 'el', 'en', 'x', 'y', 'con', 'por', 'a', 'al']);
const claveComparable = (nombre) => {
  const t = claveProducto(nombre)
    .replace(/(\d)\s*(kilos?|kgs?|k)\b/g, '$1 kg').replace(/\b(kilos?|kgs?)\b/g, 'kg')
    .replace(/(\d)\s*(litros?|lts?|l)\b/g, '$1 l').replace(/\blitros?\b/g, 'l')
    .replace(/(\d)\s*(gramos?|grs?|g)\b/g, '$1 g')
    .replace(/(\d)\s*(ml|cc)\b/g, '$1 ml');
  return [...new Set(t.split(' ').filter((w) => w && !SOBRAN.has(w)))].sort().join(' ');
};
const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'en', 'x', 'y', 'con', 'sin', 'para', 'a', 'al', 'por']);
const nombreProducto = (nombre) => String(nombre ?? '').replace(/\s+/g, ' ').trim().split(' ').map((w, i) => {
  const l = w.toLowerCase();
  if (i > 0 && MINUSCULAS.has(l)) return l;
  if (/\d/.test(w)) return l;
  return l.charAt(0).toUpperCase() + l.slice(1);
}).join(' ');
const categoriaDe = (c) => {
  const t = sinTildes(c).toLowerCase().trim();
  if (!t) return 'Otros';
  if (/^aliment/.test(t)) return 'Alimentos';
  if (/^limp/.test(t)) return 'Limpieza';
  if (/^papeler/.test(t)) return 'Papelería';
  return nombreProducto(c);
};
const distancia = (a, b) => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
const numeros = (c) => (c.match(/\d+(\.\d+)?/g) || []).join('|');
const parecidos = (a, b) => {
  if (a === b) return true;
  if (numeros(a) !== numeros(b)) return false;
  const largo = Math.min(a.length, b.length);
  if (largo < 8) return false;
  return distancia(a, b) <= (largo >= 14 ? 2 : 1);
};
const parseAlias = (v) => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

// Fecha de hoy en Uruguay (UTC-3).
const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const redondear = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// ---------- stock ----------

/** Lugar "Sin ubicar" (lo crea si no existe). */
async function sinUbicar(exec) {
  const [rows] = await exec.query("SELECT id FROM stock_ubicaciones WHERE tipo = 'sin_ubicar' LIMIT 1");
  if (rows.length) return rows[0].id;
  const id = crypto.randomUUID();
  await exec.query("INSERT IGNORE INTO stock_ubicaciones (id, nombre, tipo, orden, import_key) VALUES (?, 'Sin ubicar', 'sin_ubicar', 999, 'ubic-sin-ubicar')", [id]);
  const [otra] = await exec.query("SELECT id FROM stock_ubicaciones WHERE tipo = 'sin_ubicar' LIMIT 1");
  return otra[0].id;
}

/**
 * Stock en el depósito propio (todo menos depósitos de proveedores), por producto y por lugar:
 * el último conteo de cada lugar más lo que entró y salió después.
 */
async function stockDentro(exec, productoIds) {
  if (productoIds && !productoIds.length) return new Map();
  const [rows] = await exec.query(
    `SELECT m.producto_id, m.ubicacion_id, m.tipo, m.cantidad
       FROM stock_movimientos m JOIN stock_ubicaciones u ON u.id = m.ubicacion_id
      WHERE u.tipo <> 'proveedor'${productoIds ? ' AND m.producto_id IN (?)' : ''}
      ORDER BY m.fecha, m.created_at, (m.tipo = 'conteo') DESC`,
    productoIds ? [productoIds] : []);
  const out = new Map();
  for (const m of rows) {
    let p = out.get(m.producto_id);
    if (!p) out.set(m.producto_id, (p = { total: 0, lugares: new Map() }));
    const n = Number(m.cantidad) || 0;
    p.lugares.set(m.ubicacion_id, m.tipo === 'conteo' ? n : (p.lugares.get(m.ubicacion_id) || 0) + n);
  }
  for (const p of out.values()) p.total = redondear([...p.lugares.values()].reduce((a, b) => a + b, 0));
  return out;
}

async function insertarMovs(exec, filas) {
  for (const f of filas) {
    await exec.query(
      'INSERT INTO stock_movimientos (id, fecha, producto_id, ubicacion_id, tipo, cantidad, grupo, referencia, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), f.fecha || hoy(), f.producto_id, f.ubicacion_id, f.tipo, f.cantidad, f.grupo || null, f.referencia || null, f.nota || null]);
  }
}

/** Saca mercadería: primero de los lugares con más stock; si no alcanza, lo que falta sale de "Sin ubicar". */
async function sacar(exec, productoId, cantidad, tipo, referencia, nota) {
  let resta = redondear(cantidad);
  if (resta <= 0) return;
  const st = (await stockDentro(exec, [productoId])).get(productoId);
  const lugares = st ? [...st.lugares.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]) : [];
  const grupo = 'svc-' + crypto.randomBytes(6).toString('hex');
  const filas = [];
  for (const [ubic, cant] of lugares) {
    if (resta <= 0) break;
    const x = Math.min(cant, resta);
    filas.push({ producto_id: productoId, ubicacion_id: ubic, tipo, cantidad: -x, grupo, referencia, nota });
    resta = redondear(resta - x);
  }
  if (resta > 0) filas.push({ producto_id: productoId, ubicacion_id: await sinUbicar(exec), tipo, cantidad: -resta, grupo, referencia, nota });
  await insertarMovs(exec, filas);
}

/** Devuelve mercadería: a los mismos lugares de donde salió con esa referencia; lo demás, a "Sin ubicar". */
async function devolver(exec, productoId, cantidad, tipo, referencia, nota, revierte) {
  let resta = redondear(cantidad);
  if (resta <= 0) return;
  const filas = [];
  const grupo = 'svc-' + crypto.randomBytes(6).toString('hex');
  if (revierte) {
    const [salidas] = await exec.query("SELECT ubicacion_id, SUM(-cantidad) AS cant FROM stock_movimientos WHERE producto_id = ? AND referencia = ? AND cantidad < 0 GROUP BY ubicacion_id", [productoId, revierte]);
    for (const s of salidas) {
      if (resta <= 0) break;
      const x = Math.min(Number(s.cant) || 0, resta);
      if (x > 0) { filas.push({ producto_id: productoId, ubicacion_id: s.ubicacion_id, tipo, cantidad: x, grupo, referencia, nota }); resta = redondear(resta - x); }
    }
  }
  if (resta > 0) filas.push({ producto_id: productoId, ubicacion_id: await sinUbicar(exec), tipo, cantidad: resta, grupo, referencia, nota });
  await insertarMovs(exec, filas);
}

// ---------- producto de SVC ↔ tablas ----------

const SELECT_PRODUCTOS = `SELECT pl.id, pl.producto_id, pl.lista, pl.codigo, pl.precio, pl.iva, pl.descripcion, pl.imagen,
    sp.nombre, sp.categoria, sp.costo, sp.stock_minimo, sp.activo
  FROM precios_lista pl JOIN stock_productos sp ON sp.id = pl.producto_id`;

function docDesde(r, stock) {
  const d = {
    id: r.id, productoId: r.producto_id, name: r.nombre, code: r.codigo || '', category: r.categoria || '',
    description: r.descripcion || '', cost: Number(r.costo) || 0, price: Number(r.precio) || 0, iva: Number(r.iva) || 0,
    stock: Math.floor(redondear(stock)), minStock: Number(r.stock_minimo) || 0, list: r.lista
  };
  if (r.imagen) d.image = r.imagen;
  if (r.activo === 0) d.inactive = true;
  return d;
}

async function all(exec, lock) {
  const [rows] = await exec.query(SELECT_PRODUCTOS + ' ORDER BY sp.nombre' + (lock ? ' FOR UPDATE' : ''));
  const st = await stockDentro(exec, null);
  // Los productos inactivos (no se trabajan más) no se ofrecen; get() los sigue encontrando para ventas viejas.
  return rows.filter((r) => r.activo !== 0).map((r) => docDesde(r, st.get(r.producto_id)?.total || 0));
}

async function get(exec, lock, id) {
  const [rows] = await exec.query(SELECT_PRODUCTOS + ' WHERE pl.id = ?', [String(id)]);
  if (!rows.length) return null;
  // Dentro de una venta se bloquea el producto: dos ventas a la vez no pueden pasar el control de stock juntas.
  if (lock) await exec.query('SELECT id FROM stock_productos WHERE id = ? FOR UPDATE', [rows[0].producto_id]);
  const st = await stockDentro(exec, [rows[0].producto_id]);
  return docDesde(rows[0], st.get(rows[0].producto_id)?.total || 0);
}

/** Busca el producto físico por nombre (o por un nombre anterior); si `parecido`, también por nombres casi iguales. */
async function buscarProducto(exec, nombre, parecido) {
  const clave = claveProducto(nombre);
  if (!clave) return null;
  const [rows] = await exec.query('SELECT id, clave, alias, nombre FROM stock_productos');
  const exacto = rows.find((r) => r.clave === clave || parseAlias(r.alias).includes(clave));
  if (exacto || !parecido) return exacto || null;
  // Mismo nombre escrito distinto: "Arroz Chef de 5 Kg" = "Arroz Chef 5 kilos".
  const comp = claveComparable(nombre);
  const comparables = (r) => [r.nombre, r.clave, ...parseAlias(r.alias)].map(claveComparable);
  return rows.find((r) => comparables(r).includes(comp)) || rows.find((r) => comparables(r).some((c) => parecidos(c, comp))) || null;
}

async function crearProducto(exec, doc) {
  const id = crypto.randomUUID();
  let clave = claveProducto(doc.name);
  const [ya] = await exec.query('SELECT id FROM stock_productos WHERE clave = ?', [clave]);
  if (ya.length) clave = clave + ' ' + crypto.randomBytes(2).toString('hex');
  await exec.query(
    'INSERT INTO stock_productos (id, clave, nombre, categoria, unidad, stock_minimo, costo, alias, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
    [id, clave, nombreProducto(doc.name), categoriaDe(doc.category), 'unidad', Number(doc.minStock) || null, Number(doc.cost) || null, JSON.stringify([claveProducto(doc.name)])]);
  return id;
}

/**
 * Guarda un producto de SVC. Si es un renglón de lista nuevo, lo une con el producto físico del mismo nombre
 * (o crea uno). El stock solo cambia si SVC lo cambió a propósito (venta, anulación, ajuste o planilla con stock).
 * opciones.parecido: unir también por nombres casi iguales (migración).
 */
async function put(exec, doc, opciones = {}) {
  const [prev] = await exec.query('SELECT * FROM precios_lista WHERE id = ?', [String(doc.id)]);
  let productoId = prev[0]?.producto_id;
  let productoNuevo = false;
  if (!productoId) {
    const encontrado = await buscarProducto(exec, doc.name, opciones.parecido);
    if (encontrado) productoId = encontrado.id;
    else { productoId = await crearProducto(exec, doc); productoNuevo = true; }
  } else {
    // Edición desde SVC: actualiza el producto físico (nombre, categoría, costo y mínimo).
    const [p] = await exec.query('SELECT clave, alias, nombre FROM stock_productos WHERE id = ?', [productoId]);
    const cambios = { categoria: categoriaDe(doc.category), costo: Number(doc.cost) || null, stock_minimo: Number(doc.minStock) || null };
    const clave = claveProducto(doc.name);
    if (p[0] && clave && clave !== p[0].clave && !parseAlias(p[0].alias).includes(clave)) {
      cambios.nombre = nombreProducto(doc.name);
      cambios.alias = JSON.stringify([...new Set([...parseAlias(p[0].alias), clave])]);
    }
    const cols = Object.keys(cambios);
    await exec.query(`UPDATE stock_productos SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`, [...cols.map((c) => cambios[c]), productoId]);
  }
  if (!prev.length && !productoNuevo) {
    // Producto que ya existía en Stock: completa costo y mínimo si no los tenía.
    await exec.query('UPDATE stock_productos SET costo = COALESCE(costo, ?), stock_minimo = COALESCE(stock_minimo, ?) WHERE id = ?',
      [Number(doc.cost) || null, Number(doc.minStock) || null, productoId]);
  }
  await exec.query(
    `INSERT INTO precios_lista (id, producto_id, lista, codigo, precio, iva, descripcion, imagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE producto_id = VALUES(producto_id), lista = VALUES(lista), codigo = VALUES(codigo), precio = VALUES(precio),
       iva = VALUES(iva), descripcion = VALUES(descripcion), imagen = VALUES(imagen)`,
    [String(doc.id), productoId, doc.list || 'comercio', doc.code || null, Number(doc.price) || 0, Number.isFinite(Number(doc.iva)) ? Number(doc.iva) : 22,
      doc.description || null, doc.image || null]);

  // Stock
  const mov = doc._mov;
  if (mov) {
    if (mov.tipo === 'salida') await sacar(exec, productoId, mov.cantidad, 'salida', mov.referencia, 'Venta SVC');
    else await devolver(exec, productoId, mov.cantidad, 'entrada', mov.referencia, 'Anulación en SVC', mov.revierte);
  } else if (doc.stock !== undefined && !opciones.sinStock) {
    // Renglón nuevo de un producto que ya existía en Stock: manda el stock de Stock (no se pisa).
    const nuevoRenglon = !prev.length && !productoNuevo;
    if (!nuevoRenglon) {
      const actual = (await stockDentro(exec, [productoId])).get(productoId)?.total || 0;
      const delta = redondear(Math.round(Number(doc.stock) || 0) - Math.floor(actual));
      if (delta > 0) await devolver(exec, productoId, delta, productoNuevo ? 'entrada' : 'ajuste', productoNuevo ? 'Alta en SVC' : 'Ajuste en SVC', null, null);
      else if (delta < 0) await sacar(exec, productoId, -delta, 'ajuste', 'Ajuste en SVC', null);
    }
  }
  const out = Object.assign({}, doc);
  delete out._mov;
  return out;
}

async function del(exec, id) { await exec.query('DELETE FROM precios_lista WHERE id = ?', [String(id)]); }
async function clear(exec) { await exec.query('DELETE FROM precios_lista'); }

module.exports = { all, get, put, del, clear, stockDentro, claveProducto, nombreProducto, buscarProducto, sinUbicar, insertarMovs, hoy };
