// Lectura del "Diario de ventas" exportado del sistema de facturación.
// Columnas: Fecha (dd/mm/aaaa hh:mm), Tipo de comprobante, Nombre del contacto, Identificador (RUT),
// Nombre del artículo, Código, Cantidad, Moneda, Imp. neto, Tasa IVA, ...
// Resultado: una fila por cliente + producto con el precio de la venta más reciente.

const COLUMNAS_DIARIO = ['Tipo de comprobante', 'Identificador', 'Nombre del artículo', 'Imp. neto'];

export const esDiarioDeVentas = (rows) =>
  Array.isArray(rows) && rows.length > 0 && COLUMNAS_DIARIO.every((c) => rows.some((r) => c in r));

const numero = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};

/** "12/01/2026 14:47" o número de Excel → { iso: '2026-01-12', orden: ms } */
const fecha = (v) => {
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return { iso: new Date(ms).toISOString().slice(0, 10), orden: ms };
  }
  const m = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0'] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return { iso: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, orden: ms };
};

/**
 * Solo ventas (contado y crédito: "VCdo"/"VCre"); se ignoran notas de crédito y devoluciones.
 * Solo clientes con RUT. Si un producto se vendió varias veces al mismo cliente, queda el precio
 * de la fecha más reciente. Precio unitario = importe neto / cantidad (sin IVA).
 */
export function leerDiarioDeVentas(rows) {
  const ultimas = new Map();
  const nombres = new Map(); // RUT → nombre más reciente
  let ventas = 0;
  for (const r of rows) {
    if (!/VC(do|re)/i.test(String(r['Tipo de comprobante'] || ''))) continue;
    const rut = String(r['Identificador'] ?? '').replace(/\D/g, '');
    const codigo = String(r['Código'] ?? r['SKU'] ?? '').trim();
    const cantidad = numero(r['Cantidad']);
    const neto = numero(r['Imp. neto']);
    const f = fecha(r['Fecha']);
    if (!rut || !codigo || !f || !(cantidad > 0) || !Number.isFinite(neto)) continue;
    ventas++;
    const nombre = String(r['Nombre del contacto'] || '').trim();
    const prevNombre = nombres.get(rut);
    if (nombre && (!prevNombre || f.orden >= prevNombre.orden)) nombres.set(rut, { nombre, orden: f.orden });

    const key = `${rut}|${codigo}`;
    const prev = ultimas.get(key);
    if (prev && prev.orden > f.orden) continue; // a igual fecha gana la que viene después
    const tasa = parseInt(String(r['Tasa IVA'] ?? '22'), 10);
    ultimas.set(key, {
      orden: f.orden,
      fecha: f.iso,
      cuit: rut,
      codigo,
      productoDesc: String(r['Nombre del artículo'] || '').trim(),
      precioUnitario: Math.round((neto / cantidad) * 100) / 100,
      iva: Number.isFinite(tasa) ? tasa : 22,
      moneda: /U\$S|USD|US\$/i.test(String(r['Moneda'] || '')) ? 'USD' : 'UYU',
    });
  }
  const filas = [...ultimas.values()].map(({ orden, ...fila }) => ({
    ...fila,
    clienteNombre: nombres.get(fila.cuit)?.nombre || `Cliente ${fila.cuit}`,
  }));
  return { filas, ventas, clientes: nombres.size };
}
