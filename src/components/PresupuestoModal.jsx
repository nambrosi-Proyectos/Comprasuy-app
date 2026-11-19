import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Save, Loader2, Wand2 } from 'lucide-react';
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

const PresupuestoModal = ({ isOpen, onClose, onSave, llamado }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const totals = useMemo(() => {
    let subtotalSinIva = 0;
    let totalIva = 0;

    items.forEach(item => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const costoUnitarioItem = parseFloat(item.precio) || 0;
      const utilidad = parseFloat(item.utilidad) || 0;
      const ivaRate = parseFloat(item.iva) || 0;
      const fleteTotal = parseFloat(item.flete) || 0;

      if (cantidad === 0) return;
      
      const fleteUnitario = fleteTotal / cantidad;
      const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
      const precioUnitarioSinIva = costoMasUtilidad + fleteUnitario;
      const ivaMontoUnitario = precioUnitarioSinIva * (ivaRate / 100);

      subtotalSinIva += precioUnitarioSinIva * cantidad;
      totalIva += ivaMontoUnitario * cantidad;
    });

    return {
      subtotal: subtotalSinIva,
      iva: totalIva,
      total: subtotalSinIva + totalIva,
    };
  }, [items]);
  
  const extractItemsWithAI = async () => {
    if (!llamado?.descripcion_completa) {
      toast({
        variant: "destructive",
        title: "No hay descripción",
        description: "No se puede extraer ítems sin una descripción completa del llamado.",
      });
      return;
    }
    setLoading(true);
    toast({
      title: "🤖 Extrayendo ítems con IA...",
      description: "Por favor, espera un momento.",
    });
    try {
      const { data, error } = await supabase.functions.invoke('analyze-pliego', {
        body: { llamado, extract_items_only: true },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      if (data.items && data.items.length > 0) {
        const newItems = data.items.map(item => ({
          ...item,
          id: Date.now() + Math.random(),
          item: item.item || '',
          cantidad: item.cantidad || 1,
          precio: 0,
          iva: 22,
          utilidad: 20,
          flete: 0,
        }));
        setItems(newItems);
        toast({
          title: `✅ ¡${newItems.length} ítems cargados!`,
          description: data.fuente === 'pagina'
            ? 'Tomados de la página del llamado: número, código, cantidades y características.'
            : 'Se han cargado los ítems detectados por la IA.',
        });
      } else {
        toast({
          title: "🤔 No se encontraron ítems",
          description: "La IA no pudo identificar ítems específicos. Puedes añadirlos manualmente.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "❌ Error de IA",
        description: `No se pudieron extraer los ítems. ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeItems = useCallback(() => {
    if (!llamado) return;
    
    let initialItems = [];
    if (llamado.presupuesto_items && llamado.presupuesto_items.length > 0) {
        initialItems = llamado.presupuesto_items;
    } else if (llamado.items && llamado.items.length > 0) {
        initialItems = llamado.items;
    }

    setItems(initialItems.map(item => ({
      ...item,
      id: item.id || Date.now() + Math.random(),
      item: item.item || item.descripcion || '',
      cantidad: item.cantidad || 1,
      precio: item.precio || 0,
      iva: item.iva || 22,
      utilidad: item.utilidad || 20,
      flete: item.flete || 0,
    })));
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
      iva: 22,
      utilidad: 20,
      flete: 0,
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = (id, field, value) => {
    const updatedItems = items.map((item) => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setItems(updatedItems);
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter((item) => item.id !== id));
  };
  
  const handleSavePresupuesto = async () => {
    setSaving(true);
    try {
      const budgetData = {
        llamado_id: llamado.id,
        items: items.map(({id, ...rest}) => rest), 
        total_presupuesto: totals.total,
        updated_at: new Date().toISOString(),
      };
      
      const { data: upsertedBudget, error: upsertError } = await supabase
        .from('presupuestos')
        .upsert({
            id: llamado.presupuesto_id, // Use existing ID if available
            llamado_id: llamado.id,
            items: items.map(({id, ...rest}) => rest),
            total_presupuesto: totals.total,
        }, { 
            onConflict: 'id',
            defaultToNull: false
        })
        .select()
        .single();
      
      if (upsertError) throw upsertError;

      const priceListItems = items.map(item => {
        const cantidad = parseFloat(item.cantidad) || 0;
        const costoUnitarioItem = parseFloat(item.precio) || 0;
        const utilidad = parseFloat(item.utilidad) || 0;
        const fleteTotal = parseFloat(item.flete) || 0;
        const fleteUnitario = cantidad > 0 ? fleteTotal / cantidad : 0;
        const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
        const precioUnitarioSinIva = costoMasUtilidad + fleteUnitario;

        return {
          item_nombre: item.item,
          cantidad: item.cantidad,
          precio_unitario: precioUnitarioSinIva,
          llamado_id: llamado.id,
          llamado_titulo: llamado.titulo,
          presupuesto_id: upsertedBudget.id,
        };
      });

      await supabase
        .from('lista_precios')
        .delete()
        .eq('presupuesto_id', upsertedBudget.id);
      
      if (priceListItems.length > 0) {
        const { error: priceListError } = await supabase
          .from('lista_precios')
          .insert(priceListItems);
        if (priceListError) throw priceListError;
      }

      toast({ title: '✅ ¡Presupuesto guardado!', description: 'Los ítems han sido actualizados y registrados en la lista de precios.' });
      
      const updatedLlamado = {
        ...llamado,
        presupuesto_items: upsertedBudget.items,
        total_presupuesto: upsertedBudget.total_presupuesto,
        presupuesto_id: upsertedBudget.id
      };
      onSave(updatedLlamado);

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
          className="bg-slate-100 border border-green-500/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col dark:bg-slate-800/80"
          variants={modal} onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200 flex justify-between items-center dark:border-slate-700">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Presupuesto para Llamado</h2>
                <p className="text-sm text-slate-500 mt-1 truncate max-w-md dark:text-gray-400">{llamado.titulo}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-grow bg-white dark:bg-slate-900">
            {loading ? (
              <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>
            ) : (
              <div className="space-y-4">
                 <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" className="w-full sm:w-auto flex-grow border-dashed border-green-500/50 text-green-600 hover:bg-green-50 dark:text-green-300" onClick={handleAddItem}>
                        <Plus className="w-4 h-4 mr-2" /> Añadir Ítem Manualmente
                    </Button>
                    <Button onClick={extractItemsWithAI} className="w-full sm:w-auto flex-grow bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                        <Wand2 className="w-4 h-4 mr-2" /> Cargar Ítems del Llamado
                    </Button>
                </div>
                {items.length > 0 ? items.map((item, index) => {
                  const cantidad = parseFloat(item.cantidad) || 0;
                  const costoUnitarioItem = parseFloat(item.precio) || 0;
                  const utilidad = parseFloat(item.utilidad) || 0;
                  const ivaRate = parseFloat(item.iva) || 0;
                  const fleteTotal = parseFloat(item.flete) || 0;

                  const fleteUnitario = cantidad > 0 ? fleteTotal / cantidad : 0;
                  const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
                  
                  const precioUnitarioSinIva = costoMasUtilidad + fleteUnitario;
                  const ivaUnitario = precioUnitarioSinIva * (ivaRate / 100);
                  const precioUnitarioConIva = precioUnitarioSinIva + ivaUnitario;

                  const itemSubtotal = precioUnitarioSinIva * cantidad;
                  const itemIva = ivaUnitario * cantidad;
                  const itemTotal = itemSubtotal + itemIva;

                  return (
                    <motion.div key={item.id} layout className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4 dark:bg-slate-800/50 dark:border-slate-700">
                      <div className="flex justify-between items-center">
                        <textarea
                          value={item.item}
                          onChange={e => handleItemChange(item.id, 'item', e.target.value)}
                          placeholder="Nombre del Ítem"
                          rows={item.item && item.item.length > 90 ? 3 : 1}
                          className="w-full resize-y text-base font-semibold bg-transparent border-0 outline-none focus:ring-0 px-1 text-slate-800 dark:text-white"
                        />
                        <Button variant="ghost" size="icon" className="text-red-500/70 hover:text-red-500 hover:bg-red-500/10" onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="space-y-1"><Label htmlFor={`cantidad-${index}`}>Cantidad{item.unidad ? ` (${item.unidad})` : ''}</Label><Input id={`cantidad-${index}`} type="number" value={item.cantidad} onChange={e => handleItemChange(item.id, 'cantidad', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`precio-${index}`}>Costo Unitario Item</Label><Input id={`precio-${index}`} type="number" value={item.precio} onChange={e => handleItemChange(item.id, 'precio', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`flete-${index}`}>Flete Total</Label><Input id={`flete-${index}`} type="number" value={item.flete} onChange={e => handleItemChange(item.id, 'flete', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`utilidad-${index}`}>Utilidad (%)</Label><Input id={`utilidad-${index}`} type="number" value={item.utilidad} onChange={e => handleItemChange(item.id, 'utilidad', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`iva-${index}`}>IVA (%)</Label>
                            <select id={`iva-${index}`} value={item.iva} onChange={e => handleItemChange(item.id, 'iva', parseInt(e.target.value, 10))} className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                <option value="0">0% (Exento)</option>
                                <option value="10">10% (Tasa Mínima)</option>
                                <option value="22">22% (Tasa Básica)</option>
                            </select>
                          </div>
                      </div>
                      <div className="bg-slate-100 p-3 rounded-md mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-center dark:bg-slate-700/50">
                          <div className="space-y-2">
                            <p className="text-xs text-slate-600 dark:text-gray-400">Precio Unitario Final</p>
                            <div className="flex justify-center items-baseline gap-4">
                                <div>
                                    <p className="font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(precioUnitarioSinIva)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">Subtotal</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(ivaUnitario)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">IVA</p>
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(precioUnitarioConIva)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">Total</p>
                                </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                             <p className="text-xs text-slate-600 dark:text-gray-400">Total por Ítem (x{cantidad})</p>
                             <div className="flex justify-center items-baseline gap-4">
                                <div>
                                    <p className="font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(itemSubtotal)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">Subtotal</p>
                                </div>
                                 <div>
                                    <p className="font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(itemIva)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">IVA</p>
                                  </div>
                                <div>
                                    <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(itemTotal)}</p>
                                    <p className="text-xs text-slate-500 dark:text-gray-400">Total</p>
                                </div>
                            </div>
                          </div>
                      </div>
                    </motion.div>
                  )
                }) : (
                  <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                    <p>No hay ítems cargados para este presupuesto.</p>
                    <p>Usa la IA para cargarlos automáticamente o añádelos de forma manual.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-between items-center dark:border-slate-700 dark:bg-slate-900/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-slate-500 text-sm dark:text-gray-400">Subtotal (sin IVA)</p>
                <p className="text-lg font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(totals.subtotal)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm dark:text-gray-400">IVA</p>
                <p className="text-lg font-semibold text-slate-700 dark:text-gray-200">{formatCurrency(totals.iva)}</p>
              </div>
              <div>
                <p className="text-slate-600 text-sm font-bold dark:text-gray-300">Total Final</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totals.total)}</p>
              </div>
            </div>
            <Button onClick={handleSavePresupuesto} disabled={saving || items.length === 0} className="bg-green-600 hover:bg-green-700 text-white min-w-[180px]">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Presupuesto
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PresupuestoModal;