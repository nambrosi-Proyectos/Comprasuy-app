import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { leerPlanillaCobros } from '@/lib/cobros';

const LOTE = 400;

const contar = async (tabla) => {
  const { count, error } = await supabase.from(tabla).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

/**
 * Importa la planilla "ventas al estado compras uy sas" (Excel descargado de Google Sheets).
 * Se puede repetir: las filas ya importadas se saltean y los clientes existentes no se pisan.
 */
export async function importarPlanillaCobros(file, onProgreso = () => {}) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const { clientes, facturas, cobros, hojas } = leerPlanillaCobros(XLSX, wb);
  if (!facturas.length) throw new Error('No se encontraron facturas en la planilla.');
  onProgreso(5, `Leídas ${facturas.length} facturas y ${cobros.length} pagos`);

  const antes = { facturas: await contar('facturas'), cobros: await contar('cobros'), clientes: await contar('cobro_clientes') };

  for (let i = 0; i < clientes.length; i += LOTE) {
    const { error } = await supabase.from('cobro_clientes').upsert(clientes.slice(i, i + LOTE), { onConflict: 'clave', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { data: todos, error: errCli } = await supabase.from('cobro_clientes').select('id, clave, nombre');
  if (errCli) throw errCli;
  const porClave = new Map(todos.map((c) => [c.clave, c]));
  onProgreso(15, 'Clientes listos');

  const total = facturas.length + cobros.length;
  let hechos = 0;
  const subir = async (tabla, filas) => {
    for (let i = 0; i < filas.length; i += LOTE) {
      const lote = filas.slice(i, i + LOTE).map(({ clave, ...f }) => {
        const c = porClave.get(clave);
        return { ...f, cliente_id: c?.id || null, cliente: c?.nombre || clave };
      });
      const { error } = await supabase.from(tabla).upsert(lote, { onConflict: 'import_key', ignoreDuplicates: true });
      if (error) throw error;
      hechos += lote.length;
      onProgreso(15 + (hechos / total) * 85, `Guardando ${tabla}… ${hechos}/${total}`);
    }
  };
  await subir('facturas', facturas);
  await subir('cobros', cobros);

  return {
    hojas,
    leidos: { facturas: facturas.length, cobros: cobros.length },
    nuevos: {
      facturas: (await contar('facturas')) - antes.facturas,
      cobros: (await contar('cobros')) - antes.cobros,
      clientes: (await contar('cobro_clientes')) - antes.clientes,
    },
  };
}
