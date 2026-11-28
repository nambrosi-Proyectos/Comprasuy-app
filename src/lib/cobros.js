// Cobros: facturas emitidas (al Estado y a privados) y pagos recibidos.
// Cálculo de pendientes, cuentas corrientes y antigüedad de la deuda,
// y lectura de la planilla "ventas al estado compras uy sas".

import { claveProveedor, formatoMonto, fechaCorta, hash, hoyISO, sumarDias } from './pagos.js';

export const EMISORES = {
  comprasuy: 'Comprasuy SAS',
  nicolas: 'Nicolás Ambrosi',
};
export const MEDIOS_COBRO = ['Transferencia BROU', 'Transferencia Itaú', 'Abitab', 'Cheque', 'Efectivo', 'Otro'];
export const TRAMOS = [
  { id: 't30', label: '0 a 30 días', hasta: 30 },
  { id: 't60', label: '31 a 60 días', hasta: 60 },
  { id: 't90', label: '61 a 90 días', hasta: 90 },
  { id: 'mas', label: 'Más de 90 días', hasta: Infinity },
];

export const claveCliente = claveProveedor;

const NO_SIGLA = new Set(['hosp', 'de', 'del', 'la', 'las', 'los', 'el', 'pol', 'rio', 'jef', 'san', 'sta', 'y', 'min']);
const SIGLAS = new Set(['asse', 'ancap', 'inau', 'mides', 'brou', 'bps', 'ute', 'ose', 'antel', 'inisa', 'sas', 'srl']);
/** "hosp clinicas" → "Hosp Clinicas"; "inr" → "INR"; "i33" → "I33". */
export const nombreCliente = (nombre) =>
  String(nombre ?? '')
    .trim()
    .replace(/[_\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      const l = w.toLowerCase();
      if (SIGLAS.has(l)) return l.toUpperCase();
      if (l.length <= 4 && !NO_SIGLA.has(l) && (/\d/.test(l) || !/[aeiou].*[aeiou]/.test(l) || w === w.toUpperCase())) return w.toUpperCase();
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join(' ');

/** Días entre dos fechas ISO. */
export const diasEntre = (desde, hasta = hoyISO()) => {
  if (!desde) return null;
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
};

export const tramoDe = (dias) => TRAMOS.find((t) => (dias ?? 0) <= t.hasta) || TRAMOS[TRAMOS.length - 1];

const suma = (filas, campo = 'importe') => filas.reduce((a, f) => a + (Number(f[campo]) || 0), 0);
const porMoneda = (filas, campo = 'importe') =>
  filas.reduce((acc, f) => ({ ...acc, [f.moneda || 'UYU']: (acc[f.moneda || 'UYU'] || 0) + (Number(f[campo]) || 0) }), {});

const ordenFecha = (a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.created_at || '').localeCompare(String(b.created_at || ''));

/**
 * Cuenta corriente de un cliente: movimientos con saldo acumulado y, aplicando los pagos
 * a las facturas más viejas primero, cuáles quedan sin cubrir (y cuánto de cada una).
 */
export const cuentaCorriente = (facturas, cobros) => {
  const movs = [
    ...facturas.map((f) => ({ tipo: 'factura', fila: f, fecha: f.fecha, created_at: f.created_at, moneda: f.moneda || 'UYU', debe: Number(f.importe) || 0, haber: 0 })),
    ...cobros.map((c) => ({ tipo: 'cobro', fila: c, fecha: c.fecha, created_at: c.created_at, moneda: c.moneda || 'UYU', debe: 0, haber: Number(c.importe) || 0 })),
  ].sort((a, b) => ordenFecha(a, b) || (a.tipo === 'factura' ? -1 : 1));
  const saldos = {};
  for (const m of movs) {
    saldos[m.moneda] = (saldos[m.moneda] || 0) + m.debe - m.haber;
    m.saldo = saldos[m.moneda];
  }
  const pendientes = [];
  for (const moneda of Object.keys(saldos)) {
    let pagado = suma(cobros.filter((c) => (c.moneda || 'UYU') === moneda));
    for (const f of facturas.filter((x) => (x.moneda || 'UYU') === moneda).sort(ordenFecha)) {
      const imp = Number(f.importe) || 0;
      const cubre = Math.min(imp, Math.max(pagado, 0));
      pagado -= cubre;
      if (imp - cubre > 0.5) pendientes.push({ ...f, pendiente: imp - cubre });
    }
  }
  const ultimoCobro = cobros.slice().sort(ordenFecha).pop() || null;
  return { movimientos: movs, saldos, pendientes, ultimoCobro };
};

/**
 * Todo lo que falta cobrar, como lista de facturas con su importe pendiente:
 * las del Estado sin marcar como cobradas y, en cuentas corrientes, lo que los pagos no cubren.
 */
export const facturasPendientes = (clientes, facturas, cobros) => {
  const modalidad = new Map(clientes.map((c) => [c.id, c.modalidad]));
  const enCuenta = (x) => modalidad.get(x.cliente_id) === 'cuenta';
  const pendientes = facturas.filter((f) => !enCuenta(f) && !f.cobrada).map((f) => ({ ...f, pendiente: Number(f.importe) || 0 }));
  const facturasCuenta = new Map();
  for (const f of facturas.filter(enCuenta)) facturasCuenta.set(f.cliente_id, [...(facturasCuenta.get(f.cliente_id) || []), f]);
  const cobrosCuenta = new Map();
  for (const c of cobros.filter(enCuenta)) cobrosCuenta.set(c.cliente_id, [...(cobrosCuenta.get(c.cliente_id) || []), c]);
  for (const [id, fs] of facturasCuenta) pendientes.push(...cuentaCorriente(fs, cobrosCuenta.get(id) || []).pendientes);
  const hoy = hoyISO();
  return pendientes.map((p) => ({ ...p, dias: diasEntre(p.fecha, hoy) }));
};

/** Totales pendientes por emisor y tramo de antigüedad (en pesos y dólares). */
export const resumenPendientes = (pendientes, hoy = hoyISO()) => {
  const r = { total: {}, porEmisor: {}, porTramo: {}, vencido90: {} };
  const sumar = (obj, moneda, v) => { obj[moneda] = (obj[moneda] || 0) + v; };
  for (const f of pendientes) {
    const m = f.moneda || 'UYU';
    const tramo = tramoDe(diasEntre(f.fecha, hoy)).id;
    sumar(r.total, m, f.pendiente);
    r.porEmisor[f.emisor] = r.porEmisor[f.emisor] || {};
    sumar(r.porEmisor[f.emisor], m, f.pendiente);
    r.porTramo[f.emisor] = r.porTramo[f.emisor] || {};
    r.porTramo[f.emisor][tramo] = r.porTramo[f.emisor][tramo] || {};
    sumar(r.porTramo[f.emisor][tramo], m, f.pendiente);
    if (tramo === 'mas') sumar(r.vencido90, m, f.pendiente);
  }
  return r;
};

/** Texto del estado de cuenta para copiar a WhatsApp. */
export const mensajeEstadoCuenta = (cliente, cuenta) => {
  const lineas = [
    `Estimado cliente *${cliente.nombre}*:`,
    '',
    'Esperamos que se encuentre muy bien. Le hacemos llegar el estado de su cuenta corriente con *Comprasuy*.',
    '',
  ];
  if (cuenta.pendientes.length) {
    lineas.push(cuenta.titulo || '*Facturas pendientes:*');
    for (const f of cuenta.pendientes) {
      const parcial = Math.abs(f.pendiente - Number(f.importe)) > 0.5 ? ` (resta ${formatoMonto(f.pendiente, f.moneda)})` : '';
      lineas.push(`• ${fechaCorta(f.fecha)} – ${f.etiqueta || `Factura ${f.numero || 's/n'}`}: ${formatoMonto(f.importe, f.moneda)}${parcial}`);
    }
    lineas.push('');
  }
  const saldos = Object.entries(cuenta.saldos).filter(([, v]) => Math.abs(v) > 0.5);
  const debe = saldos.some(([, v]) => v > 0);
  if (!saldos.length) lineas.push('*Su cuenta se encuentra al día* ✅');
  else for (const [m, v] of saldos) lineas.push(v > 0 ? `*Saldo pendiente: ${formatoMonto(v, m)}*` : `*Saldo a su favor: ${formatoMonto(-v, m)}*`);
  if (cuenta.ultimoCobro) lineas.push('', `Último pago recibido: ${fechaCorta(cuenta.ultimoCobro.fecha)} – ${formatoMonto(cuenta.ultimoCobro.importe, cuenta.ultimoCobro.moneda)}`);
  lineas.push('');
  if (debe) lineas.push('Le agradecemos coordinar el pago a la brevedad. Si ya lo realizó, por favor desestime este mensaje o envíenos el comprobante.', '');
  else lineas.push('¡Muchas gracias por estar al día!', '');
  lineas.push('Ante cualquier consulta, quedamos a su disposición.', '', 'Saludos cordiales,', '*Comprasuy*');
  return lineas.join('\n');
};

/** Facturado y cobrado por mes (últimos `meses`), por emisor, en pesos. */
export const resumenMensual = (facturas, cobros, meses = 12, hoy = hoyISO(), ventasSvc = []) => {
  const claves = [];
  const [y, m] = hoy.split('-').map(Number);
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    claves.push(d.toISOString().slice(0, 7));
  }
  const filas = new Map(claves.map((k) => [k, { mes: k, facturado: {}, cobrado: {} }]));
  const sumar = (obj, emisor, v) => { obj[emisor] = (obj[emisor] || 0) + v; };
  for (const f of facturas) {
    if ((f.moneda || 'UYU') !== 'UYU') continue;
    const fila = filas.get(String(f.fecha || '').slice(0, 7));
    if (fila) sumar(fila.facturado, f.emisor, Number(f.importe) || 0);
    const filaCobro = f.cobrada && filas.get(String(f.fecha_cobro || '').slice(0, 7));
    if (filaCobro) sumar(filaCobro.cobrado, f.emisor, Number(f.importe) || 0);
  }
  for (const c of cobros) {
    if ((c.moneda || 'UYU') !== 'UYU') continue;
    const fila = filas.get(String(c.fecha || '').slice(0, 7));
    if (fila) sumar(fila.cobrado, c.emisor, Number(c.importe) || 0);
  }
  // Ventas de SVC: vendido en el mes de la venta, cobrado en el mes en que se cobró.
  for (const v of ventasSvc) {
    const fila = filas.get(String(v.fecha || '').slice(0, 7));
    if (fila) sumar(fila.facturado, 'svc', v.total);
    const filaCobro = v.pagadaEl && filas.get(v.pagadaEl.slice(0, 7));
    if (filaCobro) sumar(filaCobro.cobrado, 'svc', v.total);
  }
  return [...filas.values()];
};

export const NOMBRE_MES = (clave) => {
  const [y, m] = clave.split('-');
  return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'][Number(m) - 1]} ${y.slice(2)}`;
};

export { porMoneda, suma };

// ---------- Planilla "ventas al estado compras uy sas" ----------

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** "$173,596.00" / 26394 / "10920+4182" → número. */
const leerImporte = (v) => {
  if (typeof v === 'number') return v;
  const t = texto(v);
  if (!t || /[a-z]{3,}/i.test(t.replace(/u\$s|usd/i, ''))) return 0;
  return t.split('+').reduce((a, parte) => {
    let p = parte.replace(/[^\d.,-]/g, '');
    if (/,\d{3}(\.|$)/.test(p)) p = p.replace(/,/g, ''); // 173,596.00
    else if (/\.\d{3}(,|$)/.test(p)) p = p.replace(/\./g, '').replace(',', '.'); // 173.596,00
    else p = p.replace(',', '.');
    const n = parseFloat(p);
    return a + (Number.isFinite(n) ? n : 0);
  }, 0);
};

const MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const valida = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && !Number.isNaN(Date.parse(iso(y, m, d)));

/** Elige el año para un día/mes sin año: el más cercano a `ref`, sin pasar de hoy + 1 semana. */
const conAnio = (m, d, ref, tope) => {
  const yRef = Number(ref.slice(0, 4));
  let mejor = null;
  for (const y of [yRef - 1, yRef, yRef + 1]) {
    if (!valida(y, m, d)) continue;
    const f = iso(y, m, d);
    if (f > tope) continue;
    const dist = Math.abs(Date.parse(f) - Date.parse(ref));
    if (!mejor || dist < mejor.dist) mejor = { f, dist };
  }
  return mejor?.f || null;
};

/**
 * Fecha de una celda: número de Excel, "27/5", "13/04/2026", "21-set", "pago 3/6"…
 * Sin año, se toma el más cercano a `ref`. Fechas en el futuro (Sheets les puso el año
 * en que se tipearon) se pasan al año anterior.
 */
export const leerFechaCelda = (v, ref = hoyISO(), hoy = hoyISO()) => {
  const tope = sumarDias(hoy, 7);
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    let f = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    while (f > tope) f = `${Number(f.slice(0, 4)) - 1}${f.slice(4)}`;
    // Sheets completa el año con el de cuando se tipeó: si queda lejos de la fila anterior, va un año antes.
    const antes = `${Number(f.slice(0, 4)) - 1}${f.slice(4)}`;
    if (ref && Date.parse(f) - Date.parse(ref) > 180 * 86400000 && Math.abs(Date.parse(antes) - Date.parse(ref)) < Date.parse(f) - Date.parse(ref)) f = antes;
    return f;
  }
  const t = texto(v).toLowerCase();
  let m = t.match(/(\d{1,2})\s*[/\-.*]+\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/);
  if (m) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    if (m[3]) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      return valida(y, mes, d) ? iso(y, mes, d) : null;
    }
    return conAnio(mes, d, ref, tope);
  }
  m = t.match(/(\d{1,2})\s*[-/ ]\s*([a-z]{3})/);
  if (m && MESES[m[2]]) return conAnio(MESES[m[2]], Number(m[1]), ref, tope);
  return null;
};

/** Fecha de cobro escrita en la columna "pago": nunca antes de la factura. */
const fechaDeCobro = (v, fechaFactura, hoy) => {
  const ref = fechaFactura || hoy;
  let f = leerFechaCelda(v, ref, hoy);
  if (!f) {
    // "pago 3/6": día/mes después de la factura
    const m = texto(v).match(/(\d{1,2})\s*[/\-.*]+\s*(\d{1,2})(?!\s*[/\-.]\s*\d)/);
    if (!m) return null;
    f = conAnio(Number(m[2]), Number(m[1]), ref, '9999-12-31');
  }
  if (f && fechaFactura) {
    while (f < sumarDias(fechaFactura, -10)) f = `${Number(f.slice(0, 4)) + 1}${f.slice(4)}`;
  }
  return f;
};

const distancia = (a, b) => {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
};

const filasDe = (XLSX, ws) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });

const emisorDeHoja = (nombre) => {
  const n = nombre.trim().toLowerCase();
  if (/^(n__a|na|nicolas|ambrosi|n\.? ?a\.?)$/.test(n) || /nicol|ambrosi/.test(n)) return 'nicolas';
  if (/^20\d\d$/.test(n)) return 'comprasuy';
  return null;
};

// Abreviaturas que en la planilla aparecen de dos formas.
const ALIAS = { imlv: 'im lavalleja' };

/** "pago brou" → "BROU"; "itau" → "Itaú". */
const nombreMedio = (t) => {
  const x = texto(t).replace(/^pago\s*/i, '');
  if (!x) return null;
  return nombreCliente(x).replace(/\bItau\b/gi, 'Itaú').replace(/\bBrou\b/gi, 'BROU');
};

const FACTURA_RE = /^[a-z]?\s*-?\s*\d{2,6}(\s*\/\s*\d{2,6})?$/i;
const MEDIO_RE = /pago|abitab|brou|ita[uú]|transf|cheque|efectivo|dep[oó]s/i;

/**
 * Lee la planilla. Las hojas con año ("2025", "2026") son ventas al Estado de Comprasuy SAS,
 * "n__a" las de Nicolás Ambrosi y el resto, cuentas corrientes de clientes privados.
 * Devuelve { clientes, facturas, cobros, hojas } con una clave de importación por fila.
 */
export function leerPlanillaCobros(XLSX, wb, hoy = hoyISO()) {
  const clientes = new Map(); // clave → cliente
  const facturas = [];
  const cobros = [];
  const hojas = [];
  const vistos = new Map();
  const clave = (tipo, partes) => {
    const base = `${tipo}|${partes.join('|')}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return hash(`${base}|${n}`);
  };
  const cliente = (nombre, datos) => {
    const k0 = claveCliente(nombre) || 'sin nombre';
    const k = ALIAS[k0] || k0;
    if (ALIAS[k0]) nombre = ALIAS[k0];
    if (!clientes.has(k)) clientes.set(k, { clave: k, nombre: nombreCliente(nombre) || 'Sin nombre', filas: 0, ...datos });
    clientes.get(k).filas++;
    return k;
  };

  for (const nombreHoja of wb.SheetNames) {
    if (/dashboard|resumen/i.test(nombreHoja)) continue;
    const filas = filasDe(XLSX, wb.Sheets[nombreHoja]);
    const emisor = emisorDeHoja(nombreHoja);
    const iHeader = filas.findIndex((r, i) => i < 12 && r.some((c) => /^(organismo|factura|n[º°o]\.?( factura)?|numero|fecha)$/i.test(texto(c))));
    if (iHeader < 0) continue;
    const header = filas[iHeader].map((c) => texto(c).toLowerCase());
    const info = { hoja: nombreHoja, facturas: 0, cobros: 0 };

    if (emisor && header.includes('organismo')) {
      // ----- Ventas al Estado: una fila por factura -----
      const col = (re) => header.findIndex((h) => re.test(h));
      const c = { org: col(/^organismo/), fac: col(/^factura/), fecha: col(/^fecha/), oc: col(/^oc$|orden/), imp: col(/^importe|^\$/), pago: col(/^pago/) };
      const anioHoja = /^20\d\d$/.test(nombreHoja.trim()) ? nombreHoja.trim() : null;
      let ref = anioHoja ? `${anioHoja}-01-01` : hoy;
      for (const r of filas.slice(iHeader + 1)) {
        const org = texto(r[c.org]);
        const importe = leerImporte(r[c.imp]);
        if (!org || !importe) continue;
        let fecha = leerFechaCelda(r[c.fecha], ref, hoy);
        if (fecha && anioHoja && typeof r[c.fecha] !== 'number') fecha = `${anioHoja}${fecha.slice(4)}`;
        if (fecha) ref = fecha;
        const pagoCelda = r[c.pago];
        const pagoTxt = texto(pagoCelda);
        const extra = r.slice(Math.max(...Object.values(c)) + 1).map(texto).filter(Boolean).join(' · ');
        const numero = texto(r[c.fac]) || null;
        const oc = texto(r[c.oc]) || null;
        facturas.push({
          emisor,
          clave: cliente(org, { tipo: 'estado', modalidad: 'factura' }),
          numero,
          fecha,
          oc,
          moneda: 'UYU',
          importe,
          cobrada: !!pagoTxt,
          fecha_cobro: pagoTxt ? fechaDeCobro(pagoCelda, fecha, hoy) : null,
          detalle: [pagoTxt && !/^pago\s*[\d/*\-. ]*$/i.test(pagoTxt) && typeof pagoCelda !== 'number' ? `Cobro: ${pagoTxt}` : null, extra || null].filter(Boolean).join(' · ') || null,
          import_key: clave('factura', [emisor, org.toLowerCase(), numero, fecha, importe]),
        });
        info.facturas++;
      }
      hojas.push(info);
      continue;
    }

    // ----- Cuenta corriente de un cliente privado -----
    const titulo = filas.slice(0, iHeader).flat().map(texto).filter((t) => t && !/^\d+$/.test(t) && !/^del \d/i.test(t)).join(' ');
    const clienteClave = cliente(nombreHoja.replace(/_/g, ' '), { tipo: 'privado', modalidad: 'cuenta', notas: titulo || null });
    clientes.get(clienteClave).filas--;
    // Una hoja puede tener varios bloques lado a lado (se repite el encabezado).
    const rol = (h) => (/^(factura|n[º°o]\.?( factura)?|numero)$/.test(h) ? 'fac' : /^fecha/.test(h) ? 'fecha' : /^(importe|\$)$/.test(h) ? 'imp'
      : /^(pago|pagos|haber)$/.test(h) ? 'pago' : /^(saldo|estado)$/.test(h) ? 'saldo' : /^nombre$/.test(h) ? 'nombre' : null);
    const bloques = [];
    header.forEach((h, i) => {
      const r = rol(h);
      if (!r) return;
      if (!bloques.length || bloques[bloques.length - 1][r] !== undefined) bloques.push({});
      bloques[bloques.length - 1][r] = i;
    });
    bloques.forEach((b, nb) => {
      if (b.fac === undefined || b.imp === undefined) return;
      const ultimaCol = Math.max(...Object.values(b));
      const finBloque = bloques[nb + 1] ? Math.min(...Object.values(bloques[nb + 1])) : Infinity;
      let ref = null;
      // Fecha de referencia inicial: la primera fecha completa del bloque.
      for (const r of filas.slice(iHeader + 1)) {
        const f = typeof r[b.fecha] === 'number' ? leerFechaCelda(r[b.fecha], hoy, hoy) : null;
        if (f) { ref = f; break; }
      }
      ref = ref || hoy;
      let sucursal = null;
      filas.slice(iHeader + 1).forEach((r) => {
        const celdas = { fecha: r[b.fecha], fac: r[b.fac], imp: r[b.imp], pago: b.pago !== undefined ? r[b.pago] : '', saldo: b.saldo !== undefined ? r[b.saldo] : '' };
        const t = Object.fromEntries(Object.entries(celdas).map(([k, v]) => [k, texto(v)]));
        if (b.nombre !== undefined && texto(r[b.nombre]) && !leerFechaCelda(r[b.nombre], ref, hoy)) sucursal = nombreCliente(texto(r[b.nombre]));
        const fecha = leerFechaCelda(celdas.fecha, ref, hoy) || (FACTURA_RE.test(t.fac) ? null : leerFechaCelda(celdas.fac, ref, hoy));
        if (fecha) ref = fecha;
        const imp = leerImporte(celdas.imp);
        const pagoNum = typeof celdas.pago === 'number' ? celdas.pago : leerImporte(t.pago);
        const saldoNum = leerImporte(celdas.saldo);
        const resto = r.slice(ultimaCol + 1, finBloque).map(texto).filter(Boolean);

        const esPago = [t.fecha, t.fac, t.imp].some((x) => /^pago\b/i.test(x));
        if (esPago) {
          const importe = imp || pagoNum || saldoNum;
          if (!importe) return;
          const medio = [t.pago, ...resto].find((x) => x && !/^pago$/i.test(x) && MEDIO_RE.test(x) || /^(itau|brou|abitab)$/i.test(x)) || null;
          cobros.push({
            emisor: 'comprasuy', clave: clienteClave, fecha: fecha || ref, moneda: 'UYU', importe,
            medio: nombreMedio(medio),
            detalle: [!fecha ? 'Fecha aproximada' : null, ...resto.filter((x) => x !== medio && !/^saldo$/i.test(x))].filter(Boolean).join(' · ') || null,
            import_key: clave('cobro', [nombreHoja, nb, fecha, importe]),
          });
          info.cobros++;
          return;
        }
        if (!t.fac && imp > 0 && MEDIO_RE.test(t.pago)) {
          // "09-Dec | | 19000 | pago brou"
          cobros.push({
            emisor: 'comprasuy', clave: clienteClave, fecha: fecha || ref, moneda: 'UYU', importe: imp, medio: nombreMedio(t.pago),
            detalle: !fecha ? 'Fecha aproximada' : null, import_key: clave('cobro', [nombreHoja, nb, fecha, imp]),
          });
          info.cobros++;
          return;
        }
        if (!t.fac && !imp && pagoNum > 0 && b.pago !== undefined && /pagos?|haber/.test(header[b.pago])) {
          // Columna "pagos" con un importe y sin factura (GURISES)
          cobros.push({
            emisor: 'comprasuy', clave: clienteClave, fecha: fecha || ref, moneda: 'UYU', importe: pagoNum, medio: null,
            detalle: !fecha ? 'Fecha aproximada' : null, import_key: clave('cobro', [nombreHoja, nb, fecha, pagoNum]),
          });
          info.cobros++;
          return;
        }
        if (FACTURA_RE.test(t.fac) && imp > 0) {
          const numero = t.fac.replace(/\s+/g, '');
          facturas.push({
            emisor: 'comprasuy', clave: clienteClave, numero, fecha, oc: null, moneda: 'UYU', importe: imp, cobrada: false, fecha_cobro: null,
            detalle: [sucursal, ...resto.filter((x) => !/^(saldo|pago)$/i.test(x))].filter(Boolean).join(' · ') || null,
            import_key: clave('factura', ['comprasuy', nombreHoja, numero, fecha, imp]),
          });
          info.facturas++;
          // La factura ya figura como pagada en la misma fila ("pago", "pago 9-11") o con un pago parcial.
          const marcaPago = [t.pago, ...resto].find((x) => /^pago\b/i.test(x));
          if (marcaPago) {
            cobros.push({
              emisor: 'comprasuy', clave: clienteClave, fecha: fechaDeCobro(marcaPago, fecha, hoy) || fecha, moneda: 'UYU', importe: imp, medio: null,
              detalle: `Pago de la factura ${numero}`, import_key: clave('cobro', [nombreHoja, nb, 'factura', numero, imp]),
            });
            info.cobros++;
          } else if (pagoNum > 0 && pagoNum < imp - 0.5 && b.saldo !== undefined && b.pago !== undefined && /pago/.test(header[b.pago])) {
            cobros.push({
              emisor: 'comprasuy', clave: clienteClave, fecha, moneda: 'UYU', importe: pagoNum, medio: null,
              detalle: `Pago parcial de la factura ${numero}`, import_key: clave('cobro', [nombreHoja, nb, 'parcial', numero, pagoNum]),
            });
            info.cobros++;
          }
        }
      });
    });
    hojas.push(info);
  }

  // Unir organismos escritos casi igual ("hosp clincas" → "hosp clinicas").
  const lista = [...clientes.values()].filter((c) => c.tipo === 'estado').sort((a, b) => b.filas - a.filas);
  const unir = new Map();
  for (const c of lista) {
    const destino = lista.find((o) => o !== c && o.filas >= c.filas && !unir.has(o.clave) && o.clave.length >= 5 && c.clave.length >= 5 && distancia(o.clave, c.clave) <= 2);
    if (destino) unir.set(c.clave, destino.clave);
  }
  for (const f of facturas) if (unir.has(f.clave)) f.clave = unir.get(f.clave);
  for (const k of unir.keys()) clientes.delete(k);

  return {
    clientes: [...clientes.values()].map(({ filas, ...c }) => c),
    facturas,
    cobros,
    hojas,
  };
}

// ---------- Ventas de SVC (fase 4 de la unificación) ----------

/** Cuentas que se muestran en los resúmenes: las dos que facturan y las ventas de SVC. */
export const CUENTAS = { ...EMISORES, svc: 'Ventas SVC' };
export const MEDIOS_COBRO_SVC = ['Efectivo', 'Transferencia', 'Cheque', 'Débito', 'Crédito', 'Depósito', 'Otro'];

/** Ventas de SVC pendientes de cobro, con la misma forma que las facturas pendientes. */
export const ventasSvcPendientes = (ventas, hoy = hoyISO()) =>
  ventas
    .filter((v) => v.estado === 'pendiente')
    .map((v) => ({
      id: `svc-${v.id}`, origen: 'svc', venta: v, emisor: 'svc', cliente: v.cliente, cliente_id: null,
      fecha: v.fecha, numero: v.numero != null ? String(v.numero) : '', moneda: 'UYU',
      importe: v.total, pendiente: v.total, dias: diasEntre(v.fecha, hoy),
    }));

/** Texto para WhatsApp con las ventas de SVC que un cliente tiene pendientes. */
export const mensajeVentasSvc = (cliente, ventas) => {
  const pendientes = ventas
    .filter((v) => v.estado === 'pendiente')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((v) => ({ fecha: v.fecha, importe: v.total, pendiente: v.total, moneda: 'UYU', etiqueta: `Compra N° ${v.numero ?? 's/n'}` }));
  const total = pendientes.reduce((a, v) => a + v.importe, 0);
  return mensajeEstadoCuenta({ nombre: cliente }, { pendientes, saldos: { UYU: total }, ultimoCobro: null, titulo: '*Compras pendientes de pago:*' });
};
