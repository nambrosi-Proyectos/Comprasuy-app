// Pagos a proveedores: depósitos (transferencias) y cheques emitidos.
// Normalización de nombres, bancos, monedas y fechas, mensaje de WhatsApp
// y lectura de la planilla "DEPOSITOS Y CHEQUES".

export const BANCOS = ['BROU', 'ITAU', 'SANTANDER', 'SCOTIABANK', 'BBVA', 'HSBC', 'HERITAGE', 'BANDES', 'MI DINERO', 'OCA', 'PREX'];
export const TIPOS_CUENTA = ['Caja de ahorro', 'Cuenta corriente'];
export const ESTADOS_CHEQUE = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
  debitado: { label: 'Debitado', clase: 'bg-green-100 text-green-800' },
  anulado: { label: 'Anulado', clase: 'bg-slate-200 text-slate-600' },
};

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const SUFIJOS = /^(s\.?a\.?s?|s,a|sas|srl|s\.r\.l\.?|ltda\.?)$/i;

/** Clave para reconocer al mismo proveedor escrito distinto: "Deruela S.A", "deruela s,a" → "deruela". */
export const claveProveedor = (nombre) =>
  sinTildes(nombre)
    .toLowerCase()
    .replace(/s\s*[,.]\s*a\b\.?/g, 'sa')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(sa|sas|srl|ltda)$/.test(w))
    .join(' ')
    .trim();

/** "karina varelA" → "Karina Varela"; "deruela s,a" → "Deruela S.A." */
export const nombreProveedor = (nombre) =>
  String(nombre ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => {
      if (SUFIJOS.test(w)) {
        const s = w.toLowerCase().replace(/[^a-z]/g, '');
        return s === 'srl' ? 'S.R.L.' : s === 'sas' ? 'S.A.S.' : s === 'ltda' ? 'Ltda.' : 'S.A.';
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');

export const normalizarBanco = (banco) => {
  const b = sinTildes(banco).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!b) return null;
  if (/REPUBLICA|^BROU/.test(b)) return 'BROU';
  if (/ITAU/.test(b)) return 'ITAU';
  if (/SCOTIA/.test(b)) return 'SCOTIABANK';
  if (/SANTANDER/.test(b)) return 'SANTANDER';
  return b;
};

/** "u$$ 368", "U$S 1.200", 7286 → { monto, usd } */
export const leerMonto = (valor) => {
  if (typeof valor === 'number') return { monto: valor, usd: false };
  const texto = String(valor ?? '').trim();
  const usd = /u\s*\$|us\$|usd|dolar/i.test(texto);
  let num = texto.replace(/[^\d.,-]/g, '');
  if (num.includes(',') && num.includes('.')) num = num.lastIndexOf(',') > num.lastIndexOf('.') ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  else if (num.includes(',')) num = /,\d{1,2}$/.test(num) ? num.replace(',', '.') : num.replace(/,/g, '');
  const monto = Number(num);
  return { monto: Number.isFinite(monto) ? monto : NaN, usd };
};

export const normalizarMoneda = (texto, usd = false) => (usd || /dol|usd|u\$/i.test(sinTildes(texto)) ? 'USD' : 'UYU');

const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Número de Excel o "30/7/0205" (año mal tipeado → 2025) → "YYYY-MM-DD" */
export const leerFecha = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (valor instanceof Date) return iso(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  const m = String(valor).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  else if (y < 1000) y = 2020 + (y % 10); // "0205" (le faltó el 2) → 2025, "0206" → 2026
  return iso(y, m[2], m[1]);
};

export const hoyISO = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

export const sumarDias = (fechaIso, dias) => {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
};

/** "2026-11-20" → "20/11/2026" sin pasar por la zona horaria. */
export const fechaCorta = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export const formatoMonto = (monto, moneda = 'UYU') =>
  `${moneda === 'USD' ? 'U$S' : '$'} ${Number(monto || 0).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Totales por moneda: { UYU: 1234, USD: 50 } → "$ 1.234 + U$S 50" */
export const totalesPorMoneda = (filas) =>
  filas.reduce((acc, f) => ({ ...acc, [f.moneda || 'UYU']: (acc[f.moneda || 'UYU'] || 0) + (Number(f.monto) || 0) }), {});

export const textoTotales = (totales) => {
  const partes = ['UYU', 'USD'].filter((m) => totales[m]).map((m) => formatoMonto(totales[m], m));
  return partes.length ? partes.join(' + ') : formatoMonto(0);
};

// ---------- WhatsApp ----------

/** "099 123 456" → "59899123456"; "+598 99..." se respeta. */
export const numeroWhatsApp = (numero) => {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('598')) return n;
  if (n.startsWith('0')) n = n.slice(1);
  return n.length === 8 ? `598${n}` : n;
};

export const mensajeDeposito = (d) =>
  [
    '*Pago a realizar*',
    `Proveedor: ${d.proveedor}`,
    `Monto: ${formatoMonto(d.monto, d.moneda)}`,
    d.banco ? `Banco: ${d.banco}` : null,
    d.tipo_cuenta ? `Tipo de cuenta: ${d.tipo_cuenta}` : null,
    d.numero_cuenta ? `Cuenta: ${d.numero_cuenta}` : null,
    d.concepto ? `Concepto: ${d.concepto}` : null,
    d.fecha ? `Fecha: ${fechaCorta(d.fecha)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

export const urlWhatsApp = (numero, texto) => {
  const n = numeroWhatsApp(numero);
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
};

/** Resumen de los depósitos de un día: detalle y suma en pesos y en dólares, listo para WhatsApp. */
export const mensajeResumenDepositos = (fechaIso, depositos) => {
  const t = totalesPorMoneda(depositos);
  const cant = (moneda) => depositos.filter((d) => (d.moneda || 'UYU') === moneda).length;
  const detalle = (moneda) =>
    depositos
      .filter((d) => (d.moneda || 'UYU') === moneda)
      .map((d) => `• ${d.proveedor || 'Sin proveedor'}: ${formatoMonto(d.monto, moneda)}${d.pagado ? ' ✅' : ''}`);
  const lineas = [`*Depósitos del ${fechaCorta(fechaIso)}*`, ''];
  if (!depositos.length) return [...lineas, 'No hay depósitos para este día.'].join('\n');
  if (cant('UYU')) lineas.push('*En pesos*', ...detalle('UYU'), '');
  if (cant('USD')) lineas.push('*En dólares*', ...detalle('USD'), '');
  lineas.push(`*Total pesos: ${formatoMonto(t.UYU || 0, 'UYU')}* (${cant('UYU')} ${cant('UYU') === 1 ? 'depósito' : 'depósitos'})`);
  lineas.push(`*Total dólares: ${formatoMonto(t.USD || 0, 'USD')}* (${cant('USD')} ${cant('USD') === 1 ? 'depósito' : 'depósitos'})`);
  return lineas.join('\n');
};

// ---------- Planilla "DEPOSITOS Y CHEQUES" ----------

// Hash corto y estable para no duplicar filas si se importa la planilla otra vez.
const hash = (texto) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

const claveImport = (tipo, partes, vistos) => {
  const base = `${tipo}|${partes.join('|')}`;
  const n = (vistos.get(base) || 0) + 1; // filas idénticas el mismo día: se cuentan las dos
  vistos.set(base, n);
  return `${tipo}-${hash(`${base}|${n}`)}`;
};

const texto = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};

const hojaPorNombre = (wb, patron) => wb.SheetNames.find((n) => patron.test(sinTildes(n)));

/**
 * Lee el libro (objeto de la librería xlsx) y devuelve depósitos, cheques y proveedores listos para guardar.
 * Depósitos: Fecha | Proveedor | Banco | Tipo de cuenta | Número de cuenta | Moneda | Monto | Pago realizado | Concepto
 * Cheques:   Proveedor | Fecha de entrega | Fecha de pago | Banco | Monto | Para qué (CLIENTE) | PAGO | Nº | – | Estado
 */
export function leerPlanillaPagos(XLSX, wb) {
  const hojaDep = hojaPorNombre(wb, /^dep/i);
  const hojaCheq = hojaPorNombre(wb, /cheque/i);
  if (!hojaDep && !hojaCheq) throw new Error('No encontré las hojas de depósitos ni de cheques en el archivo.');
  const filas = (hoja) => (hoja ? XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }).slice(1) : []);

  const proveedores = new Map(); // clave → datos (se queda con la cuenta del depósito más reciente)
  const anotarProveedor = (nombre, fecha, cuenta) => {
    const clave = claveProveedor(nombre);
    if (!clave) return null;
    const prev = proveedores.get(clave);
    if (!prev) proveedores.set(clave, { clave, nombre: nombreProveedor(nombre), fecha: fecha || '', ...cuenta });
    else if (cuenta && (fecha || '') >= (prev.fecha || '') && cuenta.numero_cuenta) Object.assign(prev, { fecha, ...cuenta });
    return clave;
  };

  const vistos = new Map();
  const depositos = [];
  let descartados = 0;
  for (const r of filas(hojaDep)) {
    if (!r[1] && (r[6] === null || r[6] === '')) continue;
    const { monto, usd } = leerMonto(r[6]);
    if (!Number.isFinite(monto) || (!texto(r[1]) && !monto)) {
      descartados++;
      continue;
    }
    const fecha = leerFecha(r[0]);
    // Algunos pagos (alquiler, DGI…) no tienen proveedor: se usa el concepto como nombre.
    const nombre = texto(r[1]) || texto(r[8]) || 'Sin proveedor';
    const moneda = normalizarMoneda(r[5], usd);
    const cuenta = {
      banco: normalizarBanco(r[2]),
      tipo_cuenta: texto(r[3]) ? nombreProveedor(texto(r[3])) : null,
      numero_cuenta: texto(r[4]),
      moneda,
    };
    const clave = texto(r[1]) ? anotarProveedor(r[1], fecha, cuenta) : null;
    const pagado = r[7] === true || /^(true|si|sí|x)$/i.test(String(r[7] ?? '').trim());
    depositos.push({
      clave,
      fecha,
      proveedor: nombreProveedor(nombre),
      ...cuenta,
      monto: Math.round(monto * 100) / 100,
      concepto: texto(r[8]),
      pagado,
      fecha_pagado: pagado ? fecha : null,
      import_key: claveImport('d', [fecha, clave || claveProveedor(nombre), monto, moneda, cuenta.numero_cuenta], vistos),
    });
  }

  const cheques = [];
  for (const r of filas(hojaCheq)) {
    if (!r[0] && (r[4] === null || r[4] === '')) continue;
    const { monto, usd } = leerMonto(r[4]);
    if (!texto(r[0]) || !Number.isFinite(monto)) {
      descartados++;
      continue;
    }
    const fechaPago = leerFecha(r[2]);
    const moneda = normalizarMoneda('', usd);
    const clave = anotarProveedor(r[0], null, null);
    const estadoTexto = sinTildes(r[9]).toLowerCase();
    const estado = /anul/.test(estadoTexto) ? 'anulado' : /cobr|debit/.test(estadoTexto) ? 'debitado' : 'pendiente';
    const numero = typeof r[7] === 'number' ? String(r[7]) : null;
    const nota = typeof r[7] === 'string' ? texto(r[7]) : null;
    cheques.push({
      clave,
      proveedor: nombreProveedor(r[0]),
      fecha_entrega: leerFecha(r[1]),
      fecha_pago: fechaPago,
      banco: normalizarBanco(r[3]) || 'BROU',
      numero,
      moneda,
      monto: Math.round(monto * 100) / 100,
      concepto: [texto(r[5]), nota].filter(Boolean).join(' · ') || null,
      estado,
      import_key: claveImport('c', [fechaPago, clave, monto, moneda, numero], vistos),
    });
  }

  return {
    depositos,
    cheques,
    proveedores: [...proveedores.values()].map(({ fecha, ...p }) => p),
    descartados,
  };
}
