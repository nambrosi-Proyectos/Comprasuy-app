import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Save, Loader2, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const backdrop = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

const modal = {
  hidden: { y: '100vh', opacity: 0 },
  visible: {
    y: '0',
    opacity: 1,
    transition: { delay: 0.1, type: 'spring', stiffness: 80, damping: 20 },
  },
};

const AdjudicacionModal = ({ isOpen, onClose, llamado }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const initializeItems = useCallback(() => {
    if (!llamado) return;
    setLoading(true);

    const initialItems = (llamado.adjudicado_items && llamado.adjudicado_items.length > 0)
      ? llamado.adjudicado_items.map(item => ({
          id: item.id || Date.now() + Math.random(),
          item: item.item || '',
          cantidad: item.cantidad || 1,
          precio: item.precio || 0,
        }))
      : (llamado.items || []).map(item => ({
          id: item.id || Date.now() + Math.random(),
          item: item.item || item.descripcion || '',
          cantidad: item.cantidad || 1,
          precio: 0, 
        }));

    setItems(initialItems);
    setLoading(false);
  }, [llamado]);


  useEffect(() => {
    if (isOpen) {
      initializeItems();
    }
  }, [isOpen, initializeItems]);

  const handleAddItem = () => {
    const newItem = {
      id: Date.now(),
      item: '',
      cantidad: 1,
      precio: 0,
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const totalAdjudicado = useMemo(() => {
    return items.reduce((total, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precio) || 0;
      return total + (cantidad * precio);
    }, 0);
  }, [items]);
  
  const handleSaveAdjudicacion = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('llamados')
        .update({ 
            adjudicado: true,
            adjudicado_items: items.map(({id, ...rest}) => rest),
            adjudicado_monto: totalAdjudicado
        })
        .eq('id', llamado.id);
      if (error) throw error;
      toast({ title: '🏆 ¡Adjudicación guardada!', description: 'La oportunidad ha sido actualizada.' });
      onClose();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setSaving(false);
    }
  };
  
  if (!isOpen || !llamado) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
        variants={backdrop} initial="hidden" animate="visible" exit="hidden"
        onClick={onClose}
      >
        <motion.div
          className="bg-slate-100 border border-yellow-500/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl dark:bg-slate-800/80"
          variants={modal} onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200 flex justify-between items-center dark:border-slate-700">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center dark:text-white"><Award className="w-6 h-6 mr-3 text-yellow-500"/>Registrar Adjudicación</h2>
                <p className="text-sm text-slate-500 mt-1 truncate max-w-md dark:text-gray-400">{llamado.titulo}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-grow bg-white dark:bg-slate-900">
            {loading ? (
              <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>
            ) : (
              <div className="space-y-4">
                {items.length > 0 ? items.map((item, index) => (
                    <motion.div key={item.id} layout className="bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
                      <div className="flex justify-between items-start">
                        <Input value={item.item} onChange={e => handleItemChange(item.id, 'item', e.target.value)} placeholder="Nombre del Ítem Adjudicado" className="text-lg font-semibold bg-transparent border-0 ring-0 focus:ring-0 px-1 dark:text-white" />
                        <Button variant="ghost" size="icon" className="text-red-500/70 hover:text-red-500 hover:bg-red-500/10 flex-shrink-0" onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                          <div className="space-y-1"><Label htmlFor={`cantidad-${index}`}>Cantidad Adjudicada</Label><Input id={`cantidad-${index}`} type="number" value={item.cantidad} onChange={e => handleItemChange(item.id, 'cantidad', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`precio-${index}`}>Precio Unitario Adjudicado</Label><Input id={`precio-${index}`} type="number" value={item.precio} onChange={e => handleItemChange(item.id, 'precio', parseFloat(e.target.value))} /></div>
                      </div>
                    </motion.div>
                )) : (
                  <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                    <p>No hay ítems para registrar.</p>
                    <p>Añade los ítems que te fueron adjudicados.</p>
                  </div>
                )}
                 <Button variant="outline" className="w-full border-dashed border-yellow-500/50 text-yellow-600 hover:bg-yellow-50 dark:text-yellow-300" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" /> Añadir Ítem Adjudicado
                </Button>
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-between items-center dark:border-slate-700 dark:bg-slate-900/50">
            <div>
                <p className="text-slate-600 text-lg dark:text-gray-300">Monto Total Adjudicado:</p>
                <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(totalAdjudicado)}</p>
            </div>
            <Button onClick={handleSaveAdjudicacion} disabled={saving} className="bg-yellow-500 hover:bg-yellow-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Adjudicación
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AdjudicacionModal;