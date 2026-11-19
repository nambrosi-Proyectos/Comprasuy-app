import { supabase } from '@/lib/customSupabaseClient';

// El análisis se hace en el servidor: la clave de la IA ya no viaja al navegador.
export async function analyzeLlamadoWithAI(llamado) {
  const { data, error } = await supabase.functions.invoke('analyze-llamado', { body: { llamado } });
  if (error || !data || data.error) {
    console.error('Error al analizar con IA:', error?.message || data?.error);
    throw new Error('No se pudo obtener el análisis de la IA.');
  }
  return data;
}
