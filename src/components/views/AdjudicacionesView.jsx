import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import AdjudicacionCard from '@/components/AdjudicacionCard';
import { Loader2, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const AdjudicacionesView = () => {
  const [adjudicaciones, setAdjudicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const fetchFromRss = async (silent = false) => {
    setLoading(true);
    setIsRefreshing(true);
    setError(null);
    if (!silent) {
        toast({ title: '🔄 Buscando en el RSS...', description: 'Cargando adjudicaciones desde Compras Estatales.' });
    }
    try {
        const { data, error: functionError } = await supabase.functions.invoke('fetch-adjudicaciones-rss');

        if (functionError) {
          throw new Error(`Error al contactar el servicio RSS: ${functionError.message}`);
        }
        
        if (data.error) {
          throw new Error(`Error en el feed RSS: ${data.error}`);
        }

        if (data.adjudicaciones) {
            setAdjudicaciones(data.adjudicaciones);
            if (!silent) {
                toast({ title: '✅ ¡Adjudicaciones cargadas!', description: `Se encontraron ${data.adjudicaciones.length} adjudicaciones.` });
            }
        } else {
             setAdjudicaciones([]);
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
  }, []);

  const filteredAdjudicaciones = useMemo(() => {
    if (!adjudicaciones) return [];
    if (!searchTerm) return adjudicaciones;
    
    const lowercasedTerm = searchTerm.toLowerCase();
    return adjudicaciones.filter(adj =>
        adj.titulo.toLowerCase().includes(lowercasedTerm) ||
        adj.organismo.toLowerCase().includes(lowercasedTerm) ||
        adj.descripcion_completa.toLowerCase().includes(lowercasedTerm)
    );
  }, [adjudicaciones, searchTerm]);

  const handleViewOriginal = (adjudicacion) => {
    if (adjudicacion.link) {
      window.open(adjudicacion.link, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        variant: 'destructive',
        title: 'No hay link disponible',
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
          <span className="ml-4 text-slate-500">Buscando adjudicaciones en el RSS...</span>
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

    if (filteredAdjudicaciones.length === 0) {
      return (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No se encontraron adjudicaciones</h3>
          <p className="text-slate-500">El feed RSS no contiene adjudicaciones que coincidan con tu búsqueda.</p>
          <Button onClick={() => fetchFromRss(false)} className="mt-4"><RefreshCw className="mr-2 h-4 w-4" /> Volver a consultar RSS</Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filteredAdjudicaciones.map((adjudicacion, index) => (
          <AdjudicacionCard 
            key={adjudicacion.id} 
            adjudicacion={adjudicacion} 
            index={index}
            onViewOriginal={() => handleViewOriginal(adjudicacion)}
            onSaveToDb={() => toast({ title: "🚧 Funcionalidad no implementada", description: "Guardar adjudicaciones se habilitará próximamente." })}
            onFetchDetails={() => toast({ title: "🚧 Funcionalidad no implementada", description: "Cargar detalles de adjudicaciones se habilitará próximamente." })}
          />
        ))}
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="relative w-full sm:w-2/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input 
              placeholder="Buscar por título, organismo o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
          />
        </div>
        <Button onClick={() => fetchFromRss(false)} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar RSS
        </Button>
      </div>
      {renderContent()}
    </motion.div>
  );
};

export default AdjudicacionesView;