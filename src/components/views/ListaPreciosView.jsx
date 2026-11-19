import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const ITEMS_PER_PAGE = 50;

const ListaPreciosView = () => {
  const [priceList, setPriceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { toast } = useToast();
  const observer = useRef();
  const debounceTimeoutRef = useRef(null);

  const fetchPriceList = useCallback(async (currentPage, currentSearchTerm) => {
    setLoading(true);
    const from = currentPage * ITEMS_PER_PAGE;

    try {
      let query = supabase
        .from('lista_precios')
        .select(`*, llamados(*)`)
        .order('created_at', { ascending: false })
        .range(from, from + ITEMS_PER_PAGE - 1);
        
      if (currentSearchTerm) {
        query = query.ilike('item_nombre', `%${currentSearchTerm.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setPriceList(prev => currentPage === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === ITEMS_PER_PAGE);

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar la lista de precios',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    
    debounceTimeoutRef.current = setTimeout(() => {
        setPage(0);
        setPriceList([]);
        setHasMore(true);
        fetchPriceList(0, searchTerm);
    }, 500); 

    return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current) };
  }, [searchTerm, fetchPriceList]);

  useEffect(() => {
      if (page > 0) fetchPriceList(page, searchTerm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
  
  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <h1 className="text-[26px] font-extrabold text-ink">Precios Licitados</h1>
      <div className="bg-white dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <Input
          type="text"
          placeholder="Buscar por nombre de ítem..."
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
                <th scope="col" className="px-6 py-3">Ítem</th>
                <th scope="col" className="px-6 py-3">Llamado</th>
                <th scope="col" className="px-6 py-3 text-center">Cantidad</th>
                <th scope="col" className="px-6 py-3 text-right">Precio Unit. (s/IVA)</th>
                <th scope="col" className="px-6 py-3 text-center">Fecha Presupuesto</th>
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
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {loading && (
            <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <span className="ml-4 text-slate-500">Cargando más precios...</span>
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
            <p className="text-slate-500">{searchTerm ? 'Intenta con otro término de búsqueda.' : 'No hay precios registrados.'}</p>
          </motion.div>
        )}

        {!hasMore && !loading && priceList.length > 0 && (
            <div className="text-center py-6 text-slate-500">
                <p>Fin de los resultados.</p>
            </div>
        )}
      </div>
    </motion.div>
  );
};

export default ListaPreciosView;