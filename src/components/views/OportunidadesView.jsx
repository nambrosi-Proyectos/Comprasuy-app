import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import OportunidadCard from '@/components/OportunidadCard';
import PresupuestoModal from '@/components/PresupuestoModal';
import PliegoModal from '@/components/PliegoModal';
import AdjudicacionModal from '@/components/AdjudicacionModal';
import AnalisisIAModal from '@/components/AnalisisIAModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const OportunidadesView = () => {
  const [llamados, setLlamados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLlamado, setSelectedLlamado] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [llamadoToDelete, setLlamadoToDelete] = useState(null);
  const [activeFilter, setActiveFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const fetchOportunidades = useCallback(async () => {
    if (!user) {
        setLlamados([]);
        setLoading(false);
        return;
    };
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('llamados')
        .select(`
          *,
          presupuestos!presupuestos_llamado_id_fkey(
            id,
            items,
            total_presupuesto,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const processedLlamados = data.map(l => {
        const presupuesto = l.presupuestos && l.presupuestos.length > 0 ? l.presupuestos[0] : null;
        return {
          ...l,
          presupuesto_items: presupuesto?.items || [],
          total_presupuesto: presupuesto?.total_presupuesto,
          presupuesto_id: presupuesto?.id
        };
      });

      setLlamados(processedLlamados);

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar oportunidades',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if(!authLoading) {
        fetchOportunidades();
    }
    
    const channel = supabase
      .channel('oportunidades-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamados' }, (payload) => {
          if (payload.new.user_id === user?.id || (payload.old && payload.old.user_id === user?.id)) {
              fetchOportunidades();
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuestos' }, fetchOportunidades)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

  }, [fetchOportunidades, authLoading, user]);

  const filteredLlamados = useMemo(() => {
    let filtered = llamados;

    if (activeFilter === 'presentado') {
      filtered = filtered.filter(l => l.presentado && !l.adjudicado);
    } else if (activeFilter === 'adjudicado') {
      filtered = filtered.filter(l => l.adjudicado);
    } else if (activeFilter === 'pendientes') {
      filtered = filtered.filter(l => !l.presentado && !l.adjudicado);
    }
    
    if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(l => 
            l.titulo.toLowerCase().includes(lowercasedTerm) ||
            l.organismo.toLowerCase().includes(lowercasedTerm)
        );
    }

    return filtered;
  }, [llamados, activeFilter, searchTerm]);
  
  const handleOpenModal = (llamado, type) => {
    setSelectedLlamado(llamado);
    setModalType(type);
  };
  
  const handleCloseModal = () => {
    setSelectedLlamado(null);
    setModalType(null);
    fetchOportunidades();
  };

  const handleDeleteRequest = (llamado) => {
    setLlamadoToDelete(llamado);
  };

  const confirmDelete = async () => {
    if (!llamadoToDelete) return;

    toast({ title: "🗑️ Eliminando oportunidad..." });

    try {
      const { error } = await supabase
        .from('llamados')
        .delete()
        .match({ id: llamadoToDelete.id });

      if (error) throw error;
      
      setLlamados(prevLlamados => prevLlamados.filter(l => l.id !== llamadoToDelete.id));

      toast({ title: "✅ ¡Oportunidad eliminada!", description: "El llamado ha sido borrado permanentemente." });
      
    } catch (error) {
      toast({ variant: "destructive", title: "❌ Error al eliminar", description: error.message });
    } finally {
      setLlamadoToDelete(null);
    }
  };

  const handleMarkAsPresented = async (llamado) => {
    try {
      const { error } = await supabase
        .from('llamados')
        .update({ presentado: true })
        .eq('id', llamado.id);
      
      if (error) throw error;
      fetchOportunidades();
      toast({ title: '✅ ¡Marcado como presentado!', description: 'La oportunidad ha sido actualizada.' });
    } catch (error) {
      toast({ variant: "destructive", title: "❌ Error al marcar", description: error.message });
    }
  };

  const handleBudgetSave = (updatedLlamado) => {
    fetchOportunidades();
    handleCloseModal();
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
        <span className="ml-4 text-slate-500">Cargando oportunidades...</span>
      </div>
    );
  }

  const FilterButtons = () => (
    <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-grow flex flex-wrap gap-2 bg-slate-100 p-2 rounded-lg">
            <Button
                variant={activeFilter === 'todos' ? 'default' : 'ghost'}
                className={`flex-grow sm:flex-grow-0 ${activeFilter === 'todos' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setActiveFilter('todos')}
            >
                Todos ({llamados.length})
            </Button>
            <Button
                variant={activeFilter === 'pendientes' ? 'default' : 'ghost'}
                className={`flex-grow sm:flex-grow-0 ${activeFilter === 'pendientes' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setActiveFilter('pendientes')}
            >
                Pendientes ({llamados.filter(l => !l.presentado && !l.adjudicado).length})
            </Button>
            <Button
                variant={activeFilter === 'presentado' ? 'default' : 'ghost'}
                className={`flex-grow sm:flex-grow-0 ${activeFilter === 'presentado' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setActiveFilter('presentado')}
            >
                Presentados ({llamados.filter(l => l.presentado && !l.adjudicado).length})
            </Button>
            <Button
                variant={activeFilter === 'adjudicado' ? 'default' : 'ghost'}
                className={`flex-grow sm:flex-grow-0 ${activeFilter === 'adjudicado' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setActiveFilter('adjudicado')}
            >
                Adjudicados ({llamados.filter(l => l.adjudicado).length})
            </Button>
        </div>
        <div className="relative w-full md:w-1/3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input 
                placeholder="Buscar en mis oportunidades..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
            />
        </div>
    </div>
  );
  
  if (llamados.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 bg-white rounded-2xl border border-slate-200"
      >
        <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-700 mb-2">No tienes oportunidades guardadas</h3>
        <p className="text-slate-500">Guarda llamados desde la pestaña 'Llamados' para empezar.</p>
      </motion.div>
    );
  }

  return (
    <>
      <FilterButtons />
      
      {filteredLlamados.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 bg-white rounded-2xl border border-slate-200"
        >
          <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay oportunidades que coincidan</h3>
          <p className="text-slate-500">Prueba con otro filtro o término de búsqueda.</p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        {filteredLlamados.map((llamado, index) => (
          <OportunidadCard
            key={llamado.id}
            llamado={llamado}
            index={index}
            onOpenPliego={() => handleOpenModal(llamado, 'pliego')}
            onOpenPresupuesto={() => handleOpenModal(llamado, 'presupuesto')}
            onOpenAdjudicado={() => handleOpenModal(llamado, 'adjudicacion')}
            onOpenAnalisisIA={() => handleOpenModal(llamado, 'analisisIA')}
            onDelete={() => handleDeleteRequest(llamado)}
            onMarkAsPresented={handleMarkAsPresented}
          />
        ))}
      </motion.div>

      <PresupuestoModal
        isOpen={modalType === 'presupuesto'}
        onClose={handleCloseModal}
        onSave={handleBudgetSave}
        llamado={selectedLlamado}
      />
      <PliegoModal
        isOpen={modalType === 'pliego'}
        onClose={handleCloseModal}
        llamado={selectedLlamado}
      />
      <AdjudicacionModal
        isOpen={modalType === 'adjudicacion'}
        onClose={handleCloseModal}
        llamado={selectedLlamado}
      />
       <AnalisisIAModal
        isOpen={modalType === 'analisisIA'}
        onClose={handleCloseModal}
        llamado={selectedLlamado}
      />
      
      <AlertDialog open={!!llamadoToDelete} onOpenChange={() => setLlamadoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que quieres eliminar esta oportunidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se borrará la oportunidad y todos sus datos asociados, incluyendo el presupuesto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLlamadoToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={buttonVariants({ variant: 'destructive' })}>
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OportunidadesView;