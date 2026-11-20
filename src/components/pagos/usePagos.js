import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { claveProveedor, nombreProveedor } from '@/lib/pagos';

/** Carga proveedores, depósitos, cheques y el número de WhatsApp para avisos. */
export function usePagos() {
  const [proveedores, setProveedores] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    const [prov, dep, cheq, conf] = await Promise.all([
      supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
      supabase.from('depositos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('cheques').select('*').order('fecha_pago', { ascending: true }),
      supabase.from('pliego_config').select('id, whatsapp_pagos').limit(1).maybeSingle(),
    ]);
    const err = prov.error || dep.error || cheq.error;
    setError(err ? err.message : null);
    if (!err) {
      setProveedores(prov.data || []);
      setDepositos(dep.data || []);
      setCheques(cheq.data || []);
    }
    setConfig(conf.data || null);
    setLoading(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { proveedores, depositos, cheques, config, setConfig, loading, error, recargar, setDepositos, setCheques, setProveedores };
}

/**
 * Busca o crea el proveedor por nombre. Si se pasan datos de cuenta, quedan como los últimos usados
 * (así el próximo depósito se completa solo).
 */
export async function asegurarProveedor(nombre, cuenta) {
  const clave = claveProveedor(nombre);
  if (!clave) return null;
  const fila = { clave, nombre: nombreProveedor(nombre) };
  if (cuenta?.numero_cuenta) Object.assign(fila, cuenta);
  const existente = await supabase.from('proveedores').select('*').eq('clave', clave).maybeSingle();
  if (existente.error) throw existente.error;
  if (existente.data) {
    if (!cuenta?.numero_cuenta) return existente.data;
    const { data, error } = await supabase.from('proveedores').update(cuenta).eq('id', existente.data.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('proveedores').insert(fila).select().single();
  if (error) throw error;
  return data;
}
