import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Building } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const FiltrosManagement = ({ initialPalabras, initialOrganismos, onDataChange }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [palabrasClave, setPalabrasClave] = useState(initialPalabras);
  const [newPalabrasClave, setNewPalabrasClave] = useState('');
  const [organismos, setOrganismos] = useState(initialOrganismos);
  const [newOrganismo, setNewOrganismo] = useState('');

  const handleAddPalabrasClave = async () => {
    const palabras = newPalabrasClave.split('\n').map(p => p.trim()).filter(Boolean);
    if (palabras.length === 0) return;
    
    setLoading(true);
    try {
      const newRecords = palabras.map(p => ({ palabra: p }));
      const { data, error } = await supabase.from('palabras_clave_llamados').insert(newRecords).select();
      if (error) throw error;
      setPalabrasClave(prev => [...prev, ...data]);
      setNewPalabrasClave('');
      toast({ title: '✅ Palabras clave añadidas' });
      onDataChange();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al añadir', description: error.message });
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeletePalabraClave = async (id) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('palabras_clave_llamados').delete().eq('id', id);
      if (error) throw error;
      setPalabrasClave(prev => prev.filter(p => p.id !== id));
      toast({ title: '🗑️ Palabra clave eliminada' });
      onDataChange();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrganismo = async () => {
    const organismosToAdd = newOrganismo.split('\n').map(o => o.trim()).filter(Boolean);
    if (organismosToAdd.length === 0) return;

    setLoading(true);
    try {
      const newRecords = organismosToAdd.map(name => ({ name }));
      const { data, error } = await supabase.from('organismos_filter').insert(newRecords).select();
      if (error) throw error;
      setOrganismos(prev => [...prev, ...data]);
      setNewOrganismo('');
      toast({ title: '✅ Organismos añadidos' });
      onDataChange();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al añadir organismo', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrganismo = async (id) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('organismos_filter').delete().eq('id', id);
      if (error) throw error;
      setOrganismos(prev => prev.filter(o => o.id !== id));
      toast({ title: '🗑️ Organismo eliminado' });
      onDataChange();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar organismo', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-full flex flex-col">
      <div className="flex-grow">
        <h2 className="text-2xl font-semibold mb-4">Palabras Clave para Filtro</h2>
        <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
          {palabrasClave.map(p => (
            <Badge key={p.id} variant="secondary" className="text-base py-1 px-3">
              {p.palabra}
              <button onClick={() => handleDeletePalabraClave(p.id)} className="ml-2 text-red-500 hover:text-red-700">
                <Trash2 className="h-3 w-3"/>
              </button>
            </Badge>
          ))}
        </div>
        <Textarea value={newPalabrasClave} onChange={e => setNewPalabrasClave(e.target.value)} placeholder="Añade palabras clave, una por línea..." rows={2}/>
        <Button onClick={handleAddPalabrasClave} className="mt-4" disabled={loading || !newPalabrasClave.trim()}>Añadir Palabras</Button>
      </div>
      <div className="flex-grow mt-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center"><Building className="mr-2 h-6 w-6" /> Organismos para Filtro</h2>
        <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
          {organismos.map(o => (
            <Badge key={o.id} variant="secondary" className="text-base py-1 px-3 bg-blue-50 border-blue-200">
              {o.name}
              <button onClick={() => handleDeleteOrganismo(o.id)} className="ml-2 text-red-500 hover:text-red-700">
                <Trash2 className="h-3 w-3"/>
              </button>
            </Badge>
          ))}
        </div>
        <Textarea value={newOrganismo} onChange={e => setNewOrganismo(e.target.value)} placeholder="Añade organismos, uno por línea..." rows={2}/>
        <Button onClick={handleAddOrganismo} className="mt-4" disabled={loading || !newOrganismo.trim()}>Añadir Organismos</Button>
      </div>
    </div>
  );
};

export default FiltrosManagement;