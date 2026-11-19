import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import LlamadoCard from '@/components/LlamadoCard';
import LlamadoDetailModal from '@/components/LlamadoDetailModal';
import { Loader2, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const LlamadosView = () => {
  const { user } = useAuth();
  const [llamados, setLlamados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrganismo, setSelectedOrganismo] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLlamado, setSelectedLlamado] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedOpportunityIds, setSavedOpportunityIds] = useState(new Set());
  const { toast } = useToast();

  const fetchSavedOpportunities = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('llamados')
        .select('id')
        .eq('user_id', user.id);

      if (error) throw error;

      const savedIds = new Set(data.map(item => item.id.split('-user-')[0]));
      setSavedOpportunityIds(savedIds);
    } catch (error) {
      console.error('Error fetching saved opportunities:', error);
    }
  }, [user]);

  const fetchFromRss = async (silent = false) => {
    setLoading(true);
    setIsRefreshing(true);
    setError(null);
    if (!silent) {
        toast({ title: '🔄 Buscando en el RSS...', description: 'Cargando llamados abiertos desde Compras Estatales.' });
    }
    try {
        await fetchSavedOpportunities();
        const { data, error: functionError } = await supabase.functions.invoke('fetch-llamados-rss');

        if (functionError) {
          throw new Error(`Error al contactar el servicio RSS: ${functionError.message}`);
        }
        
        if (data.error) {
          throw new Error(`Error en el feed RSS: ${data.error}`);
        }

        if (data.llamados) {
            setLlamados(data.llamados);
            if (!silent) {
                toast({ title: '✅ ¡Llamados cargados!', description: `Se encontraron ${data.llamados.length} llamados abiertos.` });
            }
        } else {
             setLlamados([]);
             throw new Error("El feed RSS no devolvió datos en el formato esperado.");
        }

    } catch (e) {
        setError(e);
        if (!silent) {
            toast({ variant: 'destructive', title: '❌ Error al cargar RSS', description: e.message });
        }
        console.error("Error fetching from RSS:", e);
    } finally {
        setLoading(false);
        setIsRefreshing(false);
    }
  };
  
  useEffect(() => {
    fetchFromRss(true); 
  }, [fetchSavedOpportunities]);

  const organismosUnicos = useMemo(() => {
    if (!llamados) return ['all'];
    const allOrganismos = new Set(llamados.map(l => l.organismo).filter(Boolean));
    return ['all', ...Array.from(allOrganismos).sort()];
  }, [llamados]);

  const filteredLlamados = useMemo(() => {
    if (!llamados) return [];
    let result = llamados;

    if (selectedOrganismo !== 'all') {
      result = result.filter(l => l.organismo === selectedOrganismo);
    }

    if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        result = result.filter(l => 
            l.titulo.toLowerCase().includes(lowercasedTerm) ||
            l.organismo.toLowerCase().includes(lowercasedTerm) ||
            l.descripcion_completa.toLowerCase().includes(lowercasedTerm)
        );
    }

    return result;
  }, [llamados, selectedOrganismo, searchTerm]);

  const handleViewOriginal = (llamado) => {
    if (llamado.link) {
      window.open(llamado.link, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        variant: 'destructive',
        title: 'No hay link disponible',
      });
    }
  };
  
  const handleAnalyzeWithAI = (llamado) => {
    setSelectedLlamado(llamado);
    setIsModalOpen(true);
  };
  
  const handleSaveToDb = async (llamado, itemsExtraidos) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debes estar logueado para guardar.' });
      return;
    }

    toast({ title: '💾 Guardando oportunidad...', description: 'Por favor, espera un momento.' });

    try {
      const publicRecordId = llamado.id;
      const userOpportunityId = `${publicRecordId}-user-${user.id}`;
      
      const userOpportunityData = {
        ...llamado,
        id: userOpportunityId,
        user_id: user.id,
        items: itemsExtraidos || llamado.items || null,
        estado: 'Pendiente'
      };

      const { error } = await supabase
        .from('llamados')
        .upsert(userOpportunityData, { onConflict: 'id' });

      if (error) throw error;
      
      setSavedOpportunityIds(prev => new Set(prev).add(publicRecordId));
      toast({ title: '✅ ¡Oportunidad guardada!', description: 'Puedes verla en la sección de Oportunidades.' });

    } catch (error) {
      console.error("Error saving to DB:", error);
      toast({ variant: 'destructive', title: '❌ Error al guardar', description: error.message });
    }
  };


  const handleItemsExtracted = (items) => {
    if (selectedLlamado) {
      handleSaveToDb(selectedLlamado, items);
    }
  };
  
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
          <span className="ml-4 text-slate-500">Buscando llamados en el RSS...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-red-800 mb-2">Error al Cargar Datos del RSS</h3>
          <p className="text-red-600 mb-4">{error.message}</p>
          <Button onClick={() => fetchFromRss(false)}><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button>
        </div>
      );
    }
    
    if (filteredLlamados.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">No se encontraron llamados</h3>
                <p className="text-slate-500">El feed RSS no contiene llamados que coincidan con tus filtros o está vacío.</p>
                 <Button onClick={() => fetchFromRss(false)} className="mt-4"><RefreshCw className="mr-2 h-4 w-4" /> Volver a consultar RSS</Button>
            </div>
        );
    }

    return (
      <div className="space-y-4">
        {filteredLlamados.map((llamado, index) => (
          <LlamadoCard 
            key={llamado.id} 
            llamado={llamado} 
            index={index}
            isSaved={savedOpportunityIds.has(llamado.id)}
            onViewOriginal={() => handleViewOriginal(llamado)}
            onAnalyzeWithAI={() => handleAnalyzeWithAI(llamado)}
            onSaveToDb={() => handleSaveToDb(llamado, null)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <div className="relative w-full sm:w-1/3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input 
                    placeholder="Buscar por título, organismo o descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>
            <div className="w-full sm:w-auto">
                <Select value={selectedOrganismo} onValueChange={setSelectedOrganismo} disabled={loading || !!error}>
                <SelectTrigger className="w-full sm:w-[280px] bg-white">
                    <SelectValue placeholder="Filtrar por organismo..." />
                </SelectTrigger>
                <SelectContent>
                    {organismosUnicos.map(org => (
                    <SelectItem key={org} value={org}>
                        {org === 'all' ? 'Todos los organismos' : org}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <Button onClick={() => fetchFromRss(false)} disabled={isRefreshing} className="flex-grow sm:flex-grow-0">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Actualizar RSS
                </Button>
            </div>
        </div>
        {renderContent()}
      </motion.div>
      <LlamadoDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedLlamado(null);
        }}
        llamado={selectedLlamado}
        onViewOriginal={handleViewOriginal}
        onItemsExtracted={handleItemsExtracted}
      />
    </>
  );
};

export default LlamadosView;