import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { claveCliente, nombreCliente } from '@/lib/cobros';

/** Carga clientes, facturas y pagos recibidos. */
export const useCobros = () => {
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  return { clientes, facturas, cobros, setClientes, setFacturas, setCobros, loading, error, recargar };
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
