import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { hoyISO } from '@/lib/pagos';
import { claveProducto, nombreProducto, contenidoUbicacion } from '@/lib/stock';
import { asegurarSinUbicar } from '@/components/stock/importarStock';

const comprobar = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Carga productos, lugares, movimientos y cierres del stock. */
export const useStock = () => {
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [precios, setPrecios] = useState([]); // precios de venta por lista (los que usa SVC)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [p, u, m, c, pl] = await Promise.all([
      supabase.from('stock_productos').select('*').order('nombre', { ascending: true }),
      supabase.from('stock_ubicaciones').select('*').order('orden', { ascending: true }),
      supabase.from('stock_movimientos').select('*').order('fecha', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('stock_cierres').select('*').order('mes', { ascending: true }),
      supabase.from('precios_lista').select('*'),
    ]);
    const err = p.error || u.error || m.error || c.error;
    if (err) setError(err.message);
    else {
      setProductos(p.data || []);
      setUbicaciones(u.data || []);
      setMovimientos(m.data || []);
      setCierres(c.data || []);
      setPrecios(pl.error ? [] : pl.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { productos, ubicaciones, movimientos, cierres, precios, setProductos, setUbicaciones, setMovimientos, setCierres, setPrecios, loading, error, recargar };
};

const grupoNuevo = () => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Guarda un producto (nuevo o editado). La clave se arma del nombre; los nombres viejos quedan como alias. */
export const guardarProducto = async (valores, existente) => {
  const clave = claveProducto(valores.nombre);
  if (!clave) throw new Error('Falta el nombre del producto.');
  const fila = {
    nombre: nombreProducto(valores.nombre), clave, categoria: valores.categoria || null, unidad: valores.unidad || null,
    stock_minimo: valores.stock_minimo === '' ? null : valores.stock_minimo, costo: valores.costo === '' ? null : valores.costo,
    notas: valores.notas?.trim() || null, activo: valores.activo !== false,
    alias: [...new Set([...(existente?.alias || []), clave])],
  };
  if (existente) return comprobar(await supabase.from('stock_productos').update(fila).eq('id', existente.id).select().single());
  const ya = comprobar(await supabase.from('stock_productos').select('id').eq('clave', clave).maybeSingle());
  if (ya) throw new Error('Ya hay un producto con ese nombre.');
  return comprobar(await supabase.from('stock_productos').insert(fila).select().single());
};

/**
 * Guarda el conteo de un lugar: una fila por producto con la cantidad contada.
 * Si un producto todavía tenía stock en "Sin ubicar", ese stock pasa a estar contado acá (queda en 0 allá).
 */
export const guardarConteo = async ({ ubicacion, lineas, fecha = hoyISO(), movimientos }) => {
  const grupo = grupoNuevo();
  const filas = lineas.map((l) => ({ fecha, producto_id: l.producto_id, ubicacion_id: ubicacion.id, tipo: 'conteo', cantidad: Number(l.cantidad) || 0, grupo, nota: 'Relevamiento' }));
  if (ubicacion.tipo !== 'sin_ubicar') {
    const sin = await asegurarSinUbicar();
    const enSin = contenidoUbicacion(sin.id, movimientos);
    for (const l of lineas) {
      const s = enSin.get(l.producto_id);
      if (s && s.cantidad > 0) filas.push({ fecha, producto_id: l.producto_id, ubicacion_id: sin.id, tipo: 'conteo', cantidad: 0, grupo, nota: `Ubicado en ${ubicacion.nombre}` });
    }
  }
  if (!filas.length) return [];
  return comprobar(await supabase.from('stock_movimientos').insert(filas).select());
};

/**
 * Filas de un traslado: sale de un lugar y entra al otro, con el mismo grupo.
 * Con cantidad 0 solo se asigna el producto al destino (sin cambiar el stock).
 */
const filasTraslado = ({ producto_id, origen_id, destino_id, cantidad, fecha, nota, grupo }) => {
  const n = Number(cantidad) || 0;
  if (n < 0) throw new Error('La cantidad no puede ser negativa.');
  if (origen_id === destino_id) throw new Error('El destino tiene que ser otro lugar.');
  const base = { fecha, producto_id, tipo: 'traslado', grupo, nota: nota?.trim() || (n ? null : 'Asignado a otro lugar') };
  // La fila del origen lleva referencia "sale": así se sabe que el producto dejó ese lugar aunque la cantidad sea 0.
  const filas = [{ ...base, ubicacion_id: destino_id, cantidad: n }];
  if (origen_id) filas.unshift({ ...base, ubicacion_id: origen_id, cantidad: -n, referencia: 'sale' });
  return filas;
};

export const moverStock = async ({ fecha = hoyISO(), ...datos }) =>
  comprobar(await supabase.from('stock_movimientos').insert(filasTraslado({ ...datos, fecha, grupo: grupoNuevo() })).select());

/** Mueve varios productos juntos (todo lo que hay de cada uno, aunque sea 0) de un lugar a otro. */
export const moverVarios = async ({ items, origen_id, destino_id, fecha = hoyISO() }) => {
  const filas = items.flatMap((it) => filasTraslado({ producto_id: it.producto_id, cantidad: Math.max(0, it.cantidad), origen_id, destino_id, fecha, grupo: grupoNuevo() }));
  if (!filas.length) return [];
  return comprobar(await supabase.from('stock_movimientos').insert(filas).select());
};

/** Entrada (compra), salida (entrega) o ajuste. Una entrada con costo actualiza el costo del producto. */
export const registrarMovimiento = async ({ tipo, producto_id, ubicacion_id, cantidad, costo, referencia, nota, fecha = hoyISO() }) => {
  const n = Math.abs(Number(cantidad) || 0);
  if (!n) throw new Error('Falta la cantidad.');
  const fila = {
    fecha, producto_id, ubicacion_id, tipo, cantidad: tipo === 'salida' ? -n : n,
    costo: costo === '' || costo == null ? null : Number(costo), referencia: referencia?.trim() || null, nota: nota?.trim() || null,
  };
  const data = comprobar(await supabase.from('stock_movimientos').insert(fila).select().single());
  let producto = null;
  if (tipo === 'entrada' && fila.costo) producto = comprobar(await supabase.from('stock_productos').update({ costo: fila.costo }).eq('id', producto_id).select().single());
  return { movimiento: data, producto };
};

/** Une dos productos: los movimientos y el histórico del "origen" pasan al "destino" y el origen se borra. */
export const unirProductos = async (origen, destino, cierres) => {
  comprobar(await supabase.from('stock_movimientos').update({ producto_id: destino.id }).eq('producto_id', origen.id));
  // Sus precios de venta (SVC) pasan al producto que queda.
  comprobar(await supabase.from('precios_lista').update({ producto_id: destino.id }).eq('producto_id', origen.id));
  for (const c of cierres) {
    const items = c.items || [];
    if (!items.some((it) => it.p === origen.id)) continue;
    const juntos = new Map();
    for (const it of items) {
      const p = it.p === origen.id ? destino.id : it.p;
      const prev = juntos.get(p);
      if (!prev) juntos.set(p, { ...it, p });
      else juntos.set(p, { ...prev, d: (prev.d || 0) + (it.d || 0), a: (prev.a || 0) + (it.a || 0), va: (prev.va || 0) + (it.va || 0) || undefined, c: prev.c || it.c });
    }
    comprobar(await supabase.from('stock_cierres').update({ items: [...juntos.values()] }).eq('id', c.id));
  }
  const alias = [...new Set([...(destino.alias || []), destino.clave, ...(origen.alias || []), origen.clave])];
  const actualizado = comprobar(await supabase.from('stock_productos').update({
    alias,
    stock_minimo: destino.stock_minimo ?? origen.stock_minimo,
    costo: destino.costo ?? origen.costo,
  }).eq('id', destino.id).select().single());
  comprobar(await supabase.from('stock_productos').delete().eq('id', origen.id));
  return actualizado;
};

/** Precio de venta de un producto en una lista de SVC (comercio, institución o REMAR). Precio con IVA incluido. */
export const guardarPrecio = async (valores, existente) => {
  const fila = {
    producto_id: valores.producto_id, lista: valores.lista, codigo: valores.codigo?.trim() || null,
    precio: Number(String(valores.precio).replace(',', '.')) || 0, iva: Number(valores.iva) || 0, descripcion: valores.descripcion?.trim() || null,
  };
  if (existente) return comprobar(await supabase.from('precios_lista').update(fila).eq('id', existente.id).select().single());
  const id = `p-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`;
  return comprobar(await supabase.from('precios_lista').insert({ id, ...fila }).select().single());
};

export const borrarPrecio = async (precio) => comprobar(await supabase.from('precios_lista').delete().eq('id', precio.id));
