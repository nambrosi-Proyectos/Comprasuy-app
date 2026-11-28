import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { claveCliente, nombreCliente } from '@/lib/cobros';

/** Carga clientes, facturas y pagos recibidos. */
export const useCobros = () => {
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [ventasSvc, setVentasSvc] = useState([]); // ventas de SVC (pendientes y de los últimos meses)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    traerVentasSvc().then(setVentasSvc).catch(() => setVentasSvc([]));
    const [c, f, p] = await Promise.all([
      supabase.from('cobro_clientes').select('*').order('nombre', { ascending: true }),
      supabase.from('facturas').select('*').order('fecha', { ascending: false }),
      supabase.from('cobros').select('*').order('fecha', { ascending: false }),
    ]);
    const err = c.error || f.error || p.error;
    if (err) setError(err.message);
    else {
      setClientes(c.data || []);
      setFacturas(f.data || []);
      setCobros(p.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { clientes, facturas, cobros, ventasSvc, setClientes, setFacturas, setCobros, setVentasSvc, loading, error, recargar };
};

/** Busca el cliente por nombre (sin importar mayúsculas ni tildes) o lo crea. */
export const asegurarCliente = async (nombre, datos = {}) => {
  const clave = claveCliente(nombre);
  if (!clave) throw new Error('Falta el cliente.');
  const { data: existente, error } = await supabase.from('cobro_clientes').select('*').eq('clave', clave).maybeSingle();
  if (error) throw error;
  if (existente) return existente;
  const { data, error: errIns } = await supabase
    .from('cobro_clientes')
    .insert({ clave, nombre: nombreCliente(nombre), tipo: 'estado', modalidad: 'factura', ...datos })
    .select()
    .single();
  if (errIns) throw errIns;
  return data;
};

// ---------- Ventas de SVC por cobrar (fase 4) ----------
const pedir = async (url, body) => {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || data?.error || `Error ${r.status}`);
  return data;
};

export const traerVentasSvc = async () => (await pedir('/api/svc-ventas')).ventas || [];
/** Marca cobrada una venta pendiente de SVC (cambia su estado en SVC). */
export const cobrarVentaSvc = async (id, datos) => (await pedir(`/api/svc-ventas/${encodeURIComponent(id)}/cobrar`, datos)).venta;
/** Vuelve a pendiente una venta cobrada desde Cobros (solo administradores). */
export const deshacerCobroSvc = async (id) => (await pedir(`/api/svc-ventas/${encodeURIComponent(id)}/pendiente`, {})).venta;
