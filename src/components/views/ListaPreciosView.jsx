import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, FileSignature, Eye, Trash2, Search } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BudgetPreviewModal } from '@/components/BudgetPreviewModal';
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

// Presupuestos generados para clientes (pantalla Presupuestos). Los precios de licitaciones
// quedan en "Precios Licitados".
const PAGINA = 50;

const leerItems = (items) => {
  if (Array.isArray(items)) return items;
  try {
    const parsed = JSON.parse(items || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const ListaPreciosView = () => {
  const [presupuestos, setPresupuestos] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibles, setVisibles] = useState(PAGINA);
  const [preview, setPreview] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const { toast } = useToast();

  const cargar = useCallback(async () => {
    setLoading(true);
    const [presRes, configRes] = await Promise.all([
      supabase.from('presupuestos_clientes').select('*, clientes(id, name, cuit)').order('created_at', { ascending: false }),
      supabase.from('pliego_config').select('*').limit(1).maybeSingle(),
    ]);
    if (presRes.error) {
      toast({ variant: 'destructive', title: 'Error al cargar los presupuestos', description: presRes.error.message });
    } else {
      setPresupuestos((presRes.data || []).map((p) => ({ ...p, items: leerItems(p.items) })));
    }
    setConfig(configRes.data || null);
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setVisibles(PAGINA); }, [searchTerm]);

  const filtrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return presupuestos;
    return presupuestos.filter((p) =>
      `${p.clientes?.name || ''} ${p.clientes?.cuit || ''} ${p.items.map((i) => `${i.nombre || ''} ${i.codigo || ''}`).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [presupuestos, searchTerm]);

  const handleDelete = async () => {
    const p = aBorrar;
    setABorrar(null);
    const { error } = await supabase.from('presupuestos_clientes').delete().eq('id', p.id);
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: error.message });
      return;
    }
    setPresupuestos((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: 'Presupuesto eliminado' });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <BudgetPreviewModal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        presupuesto={preview}
        cliente={preview?.clientes}
        config={config}
      />
      <AlertDialog open={!!aBorrar} onOpenChange={(open) => !open && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este presupuesto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el presupuesto de {aBorrar?.clientes?.name || 'este cliente'} del {formatDate(aBorrar?.created_at)}. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h1 className="text-[26px] font-extrabold text-ink">Presupuestos Entregados</h1>
        <p className="text-slate-500">Presupuestos generados para clientes. Los precios de licitaciones están en Precios Licitados.</p>
      </div>

      <label className="relative block bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por cliente, RUT o producto…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-base outline-none focus:border-brand"
        />
      </label>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
          <span className="ml-4 text-slate-500">Cargando presupuestos...</span>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <FileSignature className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay presupuestos</h3>
          <p className="text-slate-500">
            {searchTerm ? 'Probá con otro término de búsqueda.' : 'Los presupuestos que guardes en Presupuestos van a aparecer acá.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {filtrados.length === presupuestos.length
              ? `${presupuestos.length} ${presupuestos.length === 1 ? 'presupuesto generado' : 'presupuestos generados'}`
              : `${filtrados.length} de ${presupuestos.length} presupuestos`}
          </p>
          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Productos</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3 text-right">Total c/IVA</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, visibles).map((p) => {
                  const moneda = p.moneda || 'UYU';
                  const nombres = p.items.map((i) => i.nombre).filter(Boolean);
                  return (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{p.clientes?.name || 'Cliente eliminado'}</div>
                        {p.clientes?.cuit && <div className="text-xs text-slate-500">RUT {p.clientes.cuit}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-md">
                        <span className="font-semibold text-slate-700">{p.items.length} {p.items.length === 1 ? 'ítem' : 'ítems'}</span>
                        {nombres.length > 0 && (
                          <span className="block text-xs text-slate-500 line-clamp-2">{nombres.join(' · ')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.subtotal, moneda)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-green-600">{formatCurrency(p.total, moneda)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setPreview(p)} disabled={!p.clientes}>
                            <Eye className="h-4 w-4 mr-1" /> Ver
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setABorrar(p)} className="text-red-600 hover:text-red-700" aria-label="Eliminar presupuesto">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtrados.length > visibles && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setVisibles((v) => v + PAGINA)}>
                Mostrar más ({filtrados.length - visibles} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};

export default ListaPreciosView;
