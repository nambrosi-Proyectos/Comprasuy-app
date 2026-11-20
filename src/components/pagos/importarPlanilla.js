import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { leerPlanillaPagos } from '@/lib/pagos';

const LOTE = 400;

const contar = async (tabla) => {
  const { count, error } = await supabase.from(tabla).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

/**
 * Importa la planilla "DEPOSITOS Y CHEQUES" (Excel descargado de Google Sheets).
 * Se puede repetir: las filas ya importadas se saltean y los proveedores existentes no se pisan.
 */
export async function importarPlanillaPagos(file, onProgreso = () => {}) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const { depositos, cheques, proveedores } = leerPlanillaPagos(XLSX, wb);
  onProgreso(5, `Leídos ${depositos.length} depósitos y ${cheques.length} cheques`);

  const antes = { depositos: await contar('depositos'), cheques: await contar('cheques'), proveedores: await contar('proveedores') };

  for (let i = 0; i < proveedores.length; i += LOTE) {
    const { error } = await supabase.from('proveedores').upsert(proveedores.slice(i, i + LOTE), { onConflict: 'clave', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { data: todos, error: errProv } = await supabase.from('proveedores').select('id, clave');
  if (errProv) throw errProv;
  const idPorClave = new Map(todos.map((p) => [p.clave, p.id]));
  onProgreso(15, 'Proveedores listos');

  const total = depositos.length + cheques.length;
  let hechos = 0;
  const subir = async (tabla, filas) => {
    for (let i = 0; i < filas.length; i += LOTE) {
      const lote = filas.slice(i, i + LOTE).map(({ clave, ...f }) => ({ ...f, proveedor_id: idPorClave.get(clave) || null }));
      const { error } = await supabase.from(tabla).upsert(lote, { onConflict: 'import_key', ignoreDuplicates: true });
      if (error) throw error;
      hechos += lote.length;
      onProgreso(15 + (hechos / total) * 85, `Guardando ${tabla}… ${hechos}/${total}`);
    }
  };
  await subir('depositos', depositos);
  await subir('cheques', cheques);

  return {
    leidos: { depositos: depositos.length, cheques: cheques.length },
    nuevos: {
      depositos: (await contar('depositos')) - antes.depositos,
      cheques: (await contar('cheques')) - antes.cheques,
      proveedores: (await contar('proveedores')) - antes.proveedores,
    },
  };
}
