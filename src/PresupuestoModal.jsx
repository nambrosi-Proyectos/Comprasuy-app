import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const PresupuestoModal = ({ isOpen, onClose, llamado }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const initializeItems = useCallback(() => {
    if (!llamado) return;
    setLoading(true);
    
    const initialItems = (llamado.items && llamado.items.length > 0)
      ? llamado.items.map(item => ({
          id: item.id || Date.now() + Math.random(),
          item: item.item || item.descripcion || '',
          cantidad: item.cantidad || 1,
          precio: item.precio || 0,
          iva: item.iva || 22,
          utilidad: item.utilidad || 20,
          flete: item.flete || 0,
        }))
      : [];

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
      const { error } = await supabase
        .from('llamados')
        .update({ items: items.map(({id, ...rest}) => rest) })
        .eq('id', llamado.id);
      if (error) throw error;
      toast({ title: '✅ ¡Presupuesto guardado!', description: 'Los ítems han sido actualizados en el llamado.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setSaving(false);
    }
  };
  
  const totalPresupuesto = useMemo(() => {
    return items.reduce((total, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const costoUnitarioItem = parseFloat(item.precio) || 0;
      const utilidad = parseFloat(item.utilidad) || 0;
      const iva = parseFloat(item.iva) || 0;
      const fleteTotal = parseFloat(item.flete) || 0;

      if (cantidad === 0) return total;
      
      const fleteUnitario = fleteTotal / cantidad;
      const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
      const precioFinalUnitario = costoMasUtilidad * (1 + iva / 100) + fleteUnitario;
      const costoTotalItem = precioFinalUnitario * cantidad;

      return total + costoTotalItem;
    }, 0);
  }, [items]);
  
  if (!isOpen || !llamado) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4"
        variants={backdrop} initial="hidden" animate="visible" exit="hidden"
        onClick={onClose}
      >
        <motion.div
          className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl"
          variants={modal} onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Presupuesto para Llamado</h2>
                <p className="text-sm text-slate-500 mt-1 truncate max-w-md">{llamado.titulo}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-800" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-grow bg-slate-50">
            {loading ? (
              <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : (
              <div className="space-y-4">
                {items.length > 0 ? items.map((item, index) => {
                  const cantidad = parseFloat(item.cantidad) || 0;
                  const costoUnitarioItem = parseFloat(item.precio) || 0;
                  const utilidad = parseFloat(item.utilidad) || 0;
                  const iva = parseFloat(item.iva) || 0;
                  const fleteTotal = parseFloat(item.flete) || 0;

                  const fleteUnitario = cantidad > 0 ? fleteTotal / cantidad : 0;
                  const costoMasUtilidad = costoUnitarioItem * (1 + utilidad / 100);
                  const precioFinalUnitario = costoMasUtilidad * (1 + iva / 100) + fleteUnitario;
                  const costoTotalItem = precioFinalUnitario * cantidad;

                  return (
                    <motion.div key={item.id} layout className="bg-white p-4 rounded-lg border border-slate-200 space-y-4 shadow-sm">
                      <div className="flex justify-between items-start">
                        <Input value={item.item} onChange={e => handleItemChange(item.id, 'item', e.target.value)} placeholder="Nombre del Ítem" className="text-lg font-semibold bg-transparent border-0 ring-0 focus:ring-0 px-1 flex-grow" />
                        <Button variant="ghost" size="icon" className="text-red-500/70 hover:text-red-500 hover:bg-red-500/10 flex-shrink-0" onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="space-y-1"><Label htmlFor={`cantidad-${index}`}>Cantidad</Label><Input id={`cantidad-${index}`} type="number" value={item.cantidad} onChange={e => handleItemChange(item.id, 'cantidad', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`precio-${index}`}>Costo Unit.</Label><Input id={`precio-${index}`} type="number" value={item.precio} onChange={e => handleItemChange(item.id, 'precio', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`flete-${index}`}>Flete Total</Label><Input id={`flete-${index}`} type="number" value={item.flete} onChange={e => handleItemChange(item.id, 'flete', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`utilidad-${index}`}>Utilidad (%)</Label><Input id={`utilidad-${index}`} type="number" value={item.utilidad} onChange={e => handleItemChange(item.id, 'utilidad', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label htmlFor={`iva-${index}`}>IVA (%)</Label>
                             <Select onValueChange={(value) => handleItemChange(item.id, 'iva', parseInt(value, 10))} defaultValue={item.iva.toString()}>
                                <SelectTrigger id={`iva-${index}`}>
                                  <SelectValue placeholder="Seleccionar IVA" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0% (Exento)</SelectItem>
                                  <SelectItem value="10">10% (Tasa Mínima)</SelectItem>
                                  <SelectItem value="22">22% (Tasa Básica)</SelectItem>
                                </SelectContent>
                              </Select>
                          </div>
                      </div>
                      <div className="bg-slate-50/50 p-3 rounded-md mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-center border-t border-slate-200">
                          <div>
                            <p className="text-lg font-bold text-cyan-600">{formatCurrency(precioFinalUnitario)}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">Precio Final por Unidad</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-emerald-600">{formatCurrency(costoTotalItem)}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">Costo Total del Ítem</p>
                          </div>
                      </div>
                    </motion.div>
                  )
                }) : (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-300 rounded-lg">
                    <p>No se encontraron ítems pre-cargados.</p>
                    <p className="font-semibold">¡Puedes empezar añadiendo uno nuevo!</p>
                  </div>
                )}
                 <Button variant="outline" className="w-full border-dashed border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" /> Añadir Ítem
                </Button>
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center">
            <div>
                <p className="text-slate-600 text-lg">Presupuesto Total:</p>
                <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalPresupuesto)}</p>
            </div>
            <Button onClick={handleSavePresupuesto} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px]">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Guardando...' : 'Guardar Presupuesto'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PresupuestoModal;