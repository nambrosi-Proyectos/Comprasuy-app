import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Timer as TimerIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

import { useExcelImport } from '@/hooks/useExcelImport';

import { IAAnalysisModal } from '@/components/IAAnalysisModal';
import { BudgetPreviewModal } from '@/components/BudgetPreviewModal';
import BudgetHeader from '@/components/presupuestos/BudgetHeader';
import CreateBudget from '@/components/presupuestos/CreateBudget';
import BudgetItemList from '@/components/presupuestos/BudgetItemList';
import BudgetTotals from '@/components/presupuestos/BudgetTotals';
import PreciosClienteTable from '@/components/presupuestos/PreciosClienteTable';

const PresupuestosClientesView = () => {
  const { toast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [productosCliente, setProductosCliente] = useState([]);
  const [pliegoConfig, setPliegoConfig] = useState(null);
  
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [budgetMoneda, setBudgetMoneda] = useState('UYU');

  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [isProductoModalOpen, setIsProductoModalOpen] = useState(false);
  const [newClienteName, setNewClienteName] = useState('');
  const [newProducto, setNewProducto] = useState({ nombre: '', precio_unitario: '' });
  
  const [plainTextBudget, setPlainTextBudget] = useState('');
  const [isAnalyzingBudget, setIsAnalyzingBudget] = useState(false);

  const [previewData, setPreviewData] = useState({ isOpen: false, presupuesto: null, cliente: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientesRes, productosRes, configRes] = await Promise.all([
        supabase.from('clientes').select('*').order('name'),
        supabase.from('productos_base').select('id, nombre, codigo, precio_unitario').order('nombre'),
        supabase.from('pliego_config').select('*').limit(1).maybeSingle()
      ]);

      if (clientesRes.error) throw clientesRes.error;
      if (productosRes.error) throw productosRes.error;
      // No lanzar error si configRes.error existe, ya que puede ser por 0 filas
      if (configRes.error && configRes.error.code !== 'PGRST116') {
        throw configRes.error;
      }

      setClientes(clientesRes.data || []);
      setProductos(productosRes.data || []);
      setPliegoConfig(configRes.data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const { importing, importProgress, analysisState, handleImport, elapsedTime, currentStep } = useExcelImport(fetchData);

  const handleFileChange = (event, useIA) => {
    const file = event.target.files[0];
    if (file) {
      handleImport(file, useIA);
    }
    event.target.value = null;
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClientChange = async (clienteId) => {
    setSelectedCliente(clienteId);
    setItems([]); 
    if (!clienteId) {
      setProductosCliente([]);
      return;
    }
    
    const { data: productosConPrecio, error: preciosError } = await supabase
        .from('precios_cliente')
        .select(`
            precio_unitario,
            iva,
            moneda,
            fecha_ultima_venta,
            productos_base (id, nombre, codigo)
        `)
        .eq('cliente_id', clienteId);

    if (preciosError) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la lista de productos del cliente.' });
        setProductosCliente([]);
        return;
    }

    const productosMapeados = productosConPrecio.map(pc => ({
        id: pc.productos_base.id,
        nombre: pc.productos_base.nombre,
        codigo: pc.productos_base.codigo,
        precio_unitario: pc.precio_unitario,
        iva: pc.iva,
        moneda: pc.moneda,
        fecha_ultima_venta: pc.fecha_ultima_venta
    })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

    if(productosMapeados.length > 0) {
      setBudgetMoneda(productosMapeados[0].moneda || 'UYU')
    } else {
      setBudgetMoneda('UYU')
    }

    setProductosCliente(productosMapeados);
  };

  const handleAddCliente = async () => {
    if (!newClienteName.trim()) return;
    try {
      const { data, error } = await supabase.from('clientes').insert({ name: newClienteName }).select().single();
      if (error) throw error;
      setClientes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewClienteName('');
      setIsClienteModalOpen(false);
      toast({ title: '✅ Cliente añadido' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al añadir cliente', description: error.message });
    }
  };

  const handleAddProducto = async () => {
    if (!newProducto.nombre.trim()) return;
    try {
      const { data, error } = await supabase.from('productos_base').insert({ nombre: newProducto.nombre, precio_unitario: newProducto.precio_unitario || null }).select().single();
      if (error) throw error;
      setProductos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewProducto({ nombre: '', precio_unitario: '' });
      setIsProductoModalOpen(false);
      toast({ title: '✅ Producto añadido' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al añadir producto', description: error.message });
    }
  };

  const handleAddItems = (productoIds) => {
    const itemsToAdd = productoIds.map(prodId => {
      const producto = productosCliente.find(p => p.id === prodId);
      if (!producto) return null;

      if((producto.moneda || 'UYU') !== budgetMoneda) {
         toast({ variant: 'destructive', title: 'Conflicto de Moneda', description: `El producto "${producto.nombre}" está en ${producto.moneda || 'UYU'} y no se puede añadir a un presupuesto en ${budgetMoneda}.` });
         return null;
      }
      return {
        id: Date.now() + Math.random(),
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad: 1,
        precio_unitario: producto.precio_unitario || 0,
        iva: producto.iva || 22,
        moneda: producto.moneda || 'UYU',
        precio_manual: false,
      };
    }).filter(Boolean);
    
    setItems(prev => [...prev, ...itemsToAdd]);
  };

  // Ítem libre, que no está en los productos guardados del cliente.
  const handleAddManualItem = ({ nombre, cantidad, precio_unitario, iva }) => {
    setItems(prev => [...prev, {
      id: Date.now() + Math.random(),
      producto_id: null,
      nombre,
      cantidad,
      precio_unitario,
      iva,
      moneda: budgetMoneda,
      manual: true,
      precio_manual: !precio_unitario,
    }]);
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  
  const handleRemoveItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precio_unitario) || 0;
      const ivaRate = parseFloat(item.iva) || 0;
      const subtotalItem = cantidad * precio;
      const ivaItem = subtotalItem * (ivaRate / 100);
      acc.subtotal += subtotalItem;
      acc.iva += ivaItem;
      acc.total += subtotalItem + ivaItem;
      return acc;
    }, { subtotal: 0, iva: 0, total: 0 });
  }, [items]);

  const handleSavePresupuesto = async () => {
    if (!selectedCliente || items.length === 0) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Selecciona un cliente y añade al menos un ítem.' });
      return;
    }
    if (items.some(item => !String(item.nombre || '').trim())) {
      toast({ variant: 'destructive', title: 'Falta la descripción', description: 'Escribí el nombre de cada ítem agregado a mano.' });
      return;
    }
    setSaving(true);
    try {
      const presupuestoData = {
        cliente_id: selectedCliente,
        items: items.map(({ id, ...rest }) => ({
          ...rest,
          nombre: String(rest.nombre || '').trim(),
          cantidad: parseFloat(rest.cantidad) || 0,
          precio_unitario: parseFloat(rest.precio_unitario) || 0,
          iva: parseFloat(rest.iva) || 0,
        })),
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        moneda: budgetMoneda
      };
      const { data: savedPresupuesto, error } = await supabase.from('presupuestos_clientes').insert(presupuestoData).select().single();
      if (error) throw error;
      
      const clienteData = clientes.find(c => c.id === selectedCliente);
      setPreviewData({ isOpen: true, presupuesto: savedPresupuesto, cliente: clienteData });

      toast({ title: '✅ Presupuesto guardado' });
      setItems([]);
      setPlainTextBudget('');
      
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyzeBudget = async () => {
    if (!plainTextBudget.trim() || !selectedCliente) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Selecciona un cliente y escribe el pedido en texto plano.' });
      return;
    }
    setIsAnalyzingBudget(true);
    toast({ title: '🤖 Analizando pedido con IA...', description: 'Esto puede tardar unos segundos.' });
    try {
      const { data, error } = await supabase.functions.invoke('analyze-text-budget', {
        body: { plainText: plainTextBudget, clienteId: selectedCliente, allProducts: productos, budgetMoneda },
      });

      if (error) throw new Error(`Error en el análisis de IA: ${error.message}`);
      if (data.error) throw new Error(`Error del servidor de IA: ${data.error}`);
      
      const analyzedItems = data.map(item => ({...item, precio_manual: !item.precio_unitario || item.precio_unitario === 0 }));
      setItems(prevItems => [...prevItems, ...analyzedItems]);

      setPlainTextBudget('');
      toast({ title: '✅ ¡Pedido analizado!', description: 'Se han añadido los productos al presupuesto.' });

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error en el análisis', description: error.message });
    } finally {
      setIsAnalyzingBudget(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-12 h-12 animate-spin text-orange-500" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <IAAnalysisModal 
        isOpen={analysisState.analyzing} 
        analysisState={analysisState}
        onClose={() => {}}
      />
      <BudgetPreviewModal
        isOpen={previewData.isOpen}
        onClose={() => setPreviewData({ isOpen: false, presupuesto: null, cliente: null })}
        presupuesto={previewData.presupuesto}
        cliente={previewData.cliente}
        config={pliegoConfig}
      />

      <h1 className="text-[26px] font-extrabold text-ink">Lista de Precios para Instituciones y Clientes</h1>
      
      {importing && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-medium text-blue-800">{currentStep}</p>
            <div className="flex items-center gap-2 text-sm text-blue-700">
                <TimerIcon className="h-4 w-4" />
                <span>{elapsedTime}s</span>
            </div>
          </div>
          <Progress value={importProgress} className="mt-2" />
          <p className="text-xs text-blue-600 mt-1 text-center">{Math.round(importProgress)}% completado</p>
        </div>
      )}


      <BudgetHeader 
        clientes={clientes}
        selectedCliente={selectedCliente}
        handleClientChange={handleClientChange}
        setIsClienteModalOpen={setIsClienteModalOpen}
        setIsProductoModalOpen={setIsProductoModalOpen}
        handleFileChange={handleFileChange}
        importing={importing}
      />

      {selectedCliente && (
        <PreciosClienteTable
          cliente={clientes.find((c) => c.id === selectedCliente)}
          productos={productosCliente}
        />
      )}

      <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Crear Presupuesto</h2>
            <div className="flex items-center gap-2">
                <Button onClick={() => setBudgetMoneda('UYU')} variant={budgetMoneda === 'UYU' ? 'default' : 'outline'} size="sm">$</Button>
                <Button onClick={() => setBudgetMoneda('USD')} variant={budgetMoneda === 'USD' ? 'default' : 'outline'} size="sm">U$</Button>
            </div>
        </div>

        <CreateBudget
            selectedCliente={selectedCliente}
            productosCliente={productosCliente}
            plainTextBudget={plainTextBudget}
            setPlainTextBudget={setPlainTextBudget}
            isAnalyzingBudget={isAnalyzingBudget}
            handleAnalyzeBudget={handleAnalyzeBudget}
            onAddItems={handleAddItems}
            onAddManualItem={handleAddManualItem}
            budgetMoneda={budgetMoneda}
        />
        
        {items.length > 0 && (
            <div className="max-h-[50vh] overflow-y-auto pr-2">
                <BudgetItemList 
                    items={items}
                    handleItemChange={handleItemChange}
                    handleRemoveItem={handleRemoveItem}
                    moneda={budgetMoneda}
                />
            </div>
        )}

        {items.length > 0 && (
            <BudgetTotals
                totals={totals}
                handleSavePresupuesto={handleSavePresupuesto}
                saving={saving}
                moneda={budgetMoneda}
            />
        )}
      </div>

      <Dialog open={isClienteModalOpen} onOpenChange={setIsClienteModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Añadir Nuevo Cliente</DialogTitle></DialogHeader>
          <Input placeholder="Nombre del cliente" value={newClienteName} onChange={e => setNewClienteName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClienteModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddCliente}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProductoModalOpen} onOpenChange={setIsProductoModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Añadir Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre del producto" value={newProducto.nombre} onChange={e => setNewProducto(p => ({ ...p, nombre: e.target.value }))} />
            <Input type="number" placeholder="Precio unitario base (opcional)" value={newProducto.precio_unitario} onChange={e => setNewProducto(p => ({ ...p, precio_unitario: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProductoModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddProducto}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PresupuestosClientesView;