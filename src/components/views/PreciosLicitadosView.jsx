import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ITEMS_PER_PAGE = 50;

const PreciosLicitadosView = () => {
  const [priceList, setPriceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { toast } = useToast();
  const observer = useRef();

  const [selectedLlamado, setSelectedLlamado] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [llamadoToDelete, setLlamadoToDelete] = useState(null);

  const fetchPriceList = useCallback(async (currentPage, currentSearchTerm) => {
    setLoading(true);
    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    try {
      let query = supabase
        .from('lista_precios')
        .select(`
          id,
          item_nombre,
          cantidad,
          precio_unitario,
          llamado_id,
          llamado_titulo,
          created_at,
          llamados ( * )
        `, { count: 'exact' });

      if (currentSearchTerm) {
        const searchPattern = `%${currentSearchTerm}%`;
        query = query.or(`item_nombre.ilike.${searchPattern},llamado_titulo.ilike.${searchPattern}`);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      setPriceList(prev => currentPage === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === ITEMS_PER_PAGE);

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar los precios licitados',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setPage(0);
    setPriceList([]);
    setHasMore(true);
    const handler = setTimeout(() => {
      fetchPriceList(0, searchTerm);
    }, 500); 

    return () => {
        clearTimeout(handler);
    };
  }, [searchTerm, fetchPriceList]);

  useEffect(() => {
    if (page > 0) {
      fetchPriceList(page, searchTerm);
    }
  }, [page, searchTerm, fetchPriceList]);

  const lastElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const handleOpenModal = (llamado, type) => {
    setSelectedLlamado(llamado);
    setModalType(type);
  };
  
  const handleCloseModal = () => {
    setSelectedLlamado(null);
    setModalType(null);
    setPage(0);
    setPriceList([]);
    setHasMore(true);
    fetchPriceList(0, searchTerm);
  };

  const handleDeleteRequest = (llamado) => {
    setLlamadoToDelete(llamado);
  };

  const confirmDelete = async () => {
    if (!llamadoToDelete) return;
    try {
      const { error } = await supabase.from('llamados').delete().match({ id: llamadoToDelete.id });
      if (error) throw error;
      toast({ title: "✅ ¡Oportunidad eliminada!" });
      handleCloseModal();
    } catch (error) {
      toast({ variant: "destructive", title: "❌ Error al eliminar", description: error.message });
    } finally {
      setLlamadoToDelete(null);
    }
  };

  const handleMarkAsPresented = async (llamado) => {
    try {
      const { error } = await supabase.from('llamados').update({ presentado: true }).eq('id', llamado.id);
      if (error) throw error;
      toast({ title: '✅ ¡Marcado como presentado!' });
      handleCloseModal();
    } catch (error) {
      toast({ variant: "destructive", title: "❌ Error al marcar", description: error.message });
    }
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Historial de Precios Licitados</h1>
      <div className="bg-white dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <Input
          type="text"
          placeholder="Buscar en todo el historial por producto o llamado..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="text-base"
        />
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm text-left text-slate-500 dark:text-gray-400">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-800 dark:text-gray-300">
              <tr>
                <th scope="col" className="px-6 py-3">Producto</th>
                <th scope="col" className="px-6 py-3">Llamado</th>
                <th scope="col" className="px-6 py-3 text-center">Cantidad</th>
                <th scope="col" className="px-6 py-3 text-right">Precio Unit. (s/IVA)</th>
                <th scope="col" className="px-6 py-3 text-center">Fecha</th>
                <th scope="col" className="px-6 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {priceList.map((item, index) => {
                const isLastElement = priceList.length === index + 1;
                return (
                  <motion.tr
                    ref={isLastElement ? lastElementRef : null}
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index < ITEMS_PER_PAGE ? index * 0.02 : 0 }}
                    className="bg-white border-b dark:bg-slate-800/50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{item.item_nombre}</td>
                    <td className="px-6 py-4">{item.llamado_titulo}</td>
                    <td className="px-6 py-4 text-center">{item.cantidad}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(item.precio_unitario)}</td>
                    <td className="px-6 py-4 text-center">{formatDate(item.created_at)}</td>
                    <td className="px-6 py-4 text-center">
                      {item.llamados && (
                        <Button variant="outline" size="sm" onClick={() => setSelectedLlamado(item.llamados)}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver Oportunidad
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                );
                })}
            </tbody>
          </table>
        </div>
        
        {loading && (
            <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <span className="ml-4 text-slate-500">Cargando más...</span>
            </div>
        )}

        {!loading && priceList.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700"
          >
            <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No se encontraron precios</h3>
            <p className="text-slate-500">{searchTerm ? 'Intenta con otro término de búsqueda.' : 'Presupuesta en tus oportunidades para generar un historial.'}</p>
          </motion.div>
        )}

        {!hasMore && !loading && priceList.length > 0 && (
            <div className="text-center py-6 text-slate-500">
                <p>Fin del historial.</p>
            </div>
        )}
      </div>
    </motion.div>

    {selectedLlamado && (
        <Dialog open={!!selectedLlamado} onOpenChange={() => setSelectedLlamado(null)}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Detalle de la Oportunidad</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <OportunidadCard
                        llamado={selectedLlamado}
                        index={0}
                        onOpenPliego={() => handleOpenModal(selectedLlamado, 'pliego')}
                        onOpenPresupuesto={() => handleOpenModal(selectedLlamado, 'presupuesto')}
                        onOpenAdjudicado={() => handleOpenModal(selectedLlamado, 'adjudicacion')}
                        onOpenAnalisisIA={() => handleOpenModal(selectedLlamado, 'analisisIA')}
                        onDelete={() => handleDeleteRequest(selectedLlamado)}
                        onMarkAsPresented={handleMarkAsPresented}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )}

    <PresupuestoModal isOpen={modalType === 'presupuesto'} onClose={handleCloseModal} llamado={selectedLlamado} />
    <PliegoModal isOpen={modalType === 'pliego'} onClose={handleCloseModal} llamado={selectedLlamado} />
    <AdjudicacionModal isOpen={modalType === 'adjudicacion'} onClose={handleCloseModal} llamado={selectedLlamado} />
    <AnalisisIAModal isOpen={modalType === 'analisisIA'} onClose={handleCloseModal} llamado={selectedLlamado} />
    
    <AlertDialog open={!!llamadoToDelete} onOpenChange={() => setLlamadoToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará la oportunidad y no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default PreciosLicitadosView;