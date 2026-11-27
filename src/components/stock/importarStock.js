import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { claveProveedor } from '@/lib/pagos';
import { leerPlanillaStock } from '@/lib/stock';

const LOTE = 300;

const comprobar = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Crea (si no existe) el lugar "Sin ubicar" donde queda el stock que todavía no se contó por góndola. */
export const asegurarSinUbicar = async () => {
  const existente = comprobar(await supabase.from('stock_ubicaciones').select('*').eq('tipo', 'sin_ubicar').limit(1).maybeSingle());
  if (existente) return existente;
  return comprobar(await supabase.from('stock_ubicaciones').insert({ nombre: 'Sin ubicar', tipo: 'sin_ubicar', orden: 999, import_key: 'ubic-sin-ubicar' }).select().single());
};

/**
 * Importa la planilla "STOCK DEPOSITO" (Excel descargado de Google Sheets).
 * - Productos: une los nombres que cambiaron de un mes a otro y no pisa los que ya existen.
 * - Histórico: un cierre por mes (no reemplaza cierres que ya existan).
 * - Stock actual: solo la primera vez (si todavía no se cargó nada a mano), el último mes queda
 *   en "Sin ubicar" y lo de afuera en el depósito de cada proveedor.
 */
export async function importarPlanillaStock(file, onProgreso = () => {}) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const r = leerPlanillaStock(XLSX, wb);
  if (!r.productos.length) throw new Error('No encontré productos en la planilla.');
  onProgreso(5, `Leídos ${r.productos.length} productos de ${r.hojas.length} hojas`);

  // 1) Productos
  const existentes = comprobar(await supabase.from('stock_productos').select('id, clave, alias'));
  const porClave = new Map();
  for (const p of existentes) for (const c of [p.clave, ...(p.alias || [])]) porClave.set(c, p);
  const idDeRaiz = new Map();
  const nuevos = [];
  const actualizar = [];
  for (const p of r.productos) {
    const ya = p.alias.map((c) => porClave.get(c)).find(Boolean);
    if (ya) {
      idDeRaiz.set(p.raiz, ya.id);
      const alias = [...new Set([...(ya.alias || []), ...p.alias])];
      if (alias.length !== (ya.alias || []).length) actualizar.push({ id: ya.id, alias });
    } else nuevos.push(p);
  }
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE);
    const filas = comprobar(await supabase.from('stock_productos').insert(lote.map(({ raiz, ...p }) => p)).select('id, clave'));
    const porC = new Map(filas.map((f) => [f.clave, f.id]));
    for (const p of lote) idDeRaiz.set(p.raiz, porC.get(p.clave));
    onProgreso(5 + ((i + lote.length) / nuevos.length) * 25, `Productos… ${i + lote.length}/${nuevos.length}`);
  }
  for (const a of actualizar) comprobar(await supabase.from('stock_productos').update({ alias: a.alias }).eq('id', a.id));
  const idDe = (clave) => idDeRaiz.get(r.raizDe(clave)) || idDeRaiz.get(clave);

  // 2) Lugares: "Sin ubicar" y un depósito por proveedor.
  const sinUbicar = await asegurarSinUbicar();
  const provs = comprobar(await supabase.from('proveedores').select('id, clave'));
  const provPorClave = new Map(provs.map((p) => [p.clave, p.id]));
  if (r.proveedores.length) {
    comprobar(await supabase.from('stock_ubicaciones').upsert(
      r.proveedores.map((nombre, i) => ({
        nombre, tipo: 'proveedor', orden: 500 + i, proveedor_id: provPorClave.get(claveProveedor(nombre)) || null,
        import_key: `ubic-prov-${claveProveedor(nombre)}`,
      })),
      { onConflict: 'import_key', ignoreDuplicates: true },
    ));
  }
  const ubic = comprobar(await supabase.from('stock_ubicaciones').select('id, nombre, tipo, import_key'));
  const lugarDe = (proveedor) =>
    proveedor ? ubic.find((u) => u.import_key === `ubic-prov-${claveProveedor(proveedor)}`)?.id : sinUbicar.id;
  onProgreso(40, 'Lugares listos');

  // 3) Histórico: un cierre por mes.
  const antesCierres = comprobar(await supabase.from('stock_cierres').select('mes')).map((c) => c.mes);
  const cierres = r.cierres
    .filter((c) => !antesCierres.includes(c.mes))
    .map((c) => ({
      mes: c.mes, fecha: c.fecha, valor_dentro: c.valor_dentro, valor_afuera: c.valor_afuera, nota: c.nota, origen: 'planilla',
      items: c.items.map((it) => ({ p: idDe(it.clave), d: it.d, a: it.a, c: it.c, va: it.va || undefined, l: Object.keys(it.lugares).length ? it.lugares : undefined })).filter((it) => it.p),
    }));
  for (const c of cierres) comprobar(await supabase.from('stock_cierres').insert(c));
  onProgreso(60, `Histórico: ${cierres.length} meses nuevos`);

  // 4) Stock para arrancar (solo si todavía no hay nada cargado a mano).
  const { count: manuales, error: errM } = await supabase.from('stock_movimientos').select('*', { count: 'exact', head: true }).is('import_key', null);
  if (errM) throw errM;
  let inicial = 0;
  if (!manuales) {
    const filas = r.inicial
      .map((i) => ({ fecha: i.fecha, producto_id: idDe(i.clave), ubicacion_id: lugarDe(i.ubicacion), tipo: 'conteo', cantidad: i.cantidad, nota: 'Planilla de stock', import_key: i.import_key }))
      .filter((f) => f.producto_id && f.ubicacion_id);
    for (let i = 0; i < filas.length; i += LOTE) {
      comprobar(await supabase.from('stock_movimientos').upsert(filas.slice(i, i + LOTE), { onConflict: 'import_key', ignoreDuplicates: true }));
      onProgreso(60 + ((i + LOTE) / filas.length) * 40, 'Stock actual…');
    }
    inicial = filas.length;
  }

  return {
    hojas: r.hojas,
    productosNuevos: nuevos.length,
    productosLeidos: r.productos.length,
    mesesNuevos: cierres.length,
    inicial,
    saltoInicial: !!manuales,
  };
}
