import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { posiblesDuplicados, formatoCantidad } from '@/lib/stock';
import { LISTAS_VENTA } from '@/components/stock/PreciosVenta';

const CLAVE_DESCARTADOS = 'stock-duplicados-descartados';
const leerDescartados = () => {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_DESCARTADOS) || '[]')); } catch { return new Set(); }
};

/** Pares de productos que parecen el mismo (por ejemplo, uno de la planilla y otro de SVC) para unirlos. */
const DuplicadosDialog = ({ open, productos, resumen, precios, onClose, onUnir }) => {
  const [descartados, setDescartados] = useState(leerDescartados);
  const [uniendo, setUniendo] = useState(null);
  const porId = useMemo(() => new Map(resumen.map((r) => [r.producto.id, r])), [resumen]);
  const listasDe = (id) => precios.filter((x) => x.producto_id === id).map((x) => LISTAS_VENTA[x.lista] || x.lista);
  const pares = useMemo(
    () => (open ? posiblesDuplicados(productos).filter((x) => !descartados.has(`${x.a.id}|${x.b.id}`)) : []),
    [open, productos, descartados],
  );

  const descartar = (par) => {
    const n = new Set(descartados);
    n.add(`${par.a.id}|${par.b.id}`);
    setDescartados(n);
    try { localStorage.setItem(CLAVE_DESCARTADOS, JSON.stringify([...n])); } catch { /* sin almacenamiento */ }
  };
  const unir = async (origen, destino) => {
    setUniendo(`${origen.id}|${destino.id}`);
    try { await onUnir(origen, destino); } finally { setUniendo(null); }
  };

  const Lado = ({ p }) => {
    const r = porId.get(p.id);
    const listas = listasDe(p.id);
    return (
      <div className="flex-1 min-w-[180px]">
        <b>{p.nombre}</b>
        <span className="block text-xs text-slate-500">
          {p.categoria || 'Sin categoría'} · stock {formatoCantidad(r?.total || 0)}
          {listas.length ? ` · se vende en ${listas.join(', ')}` : ''}
        </span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posibles productos repetidos</DialogTitle>
          <DialogDescription>
            Productos con nombres parecidos (por ejemplo, uno de la planilla de stock y otro de SVC). Elegí cuál queda: el otro se une a él con su stock,
            su histórico y sus precios de venta. Si no son el mismo, tocá "No son iguales".
          </DialogDescription>
        </DialogHeader>
        {!pares.length && <p className="py-6 text-center text-slate-500">No encontré más productos repetidos.</p>}
        <div className="divide-y rounded-xl border">
          {pares.map((par) => {
            const clave = `${par.a.id}|${par.b.id}`;
            const ocupado = uniendo && (uniendo.includes(par.a.id) || uniendo.includes(par.b.id));
            return (
              <div key={clave} className="p-3 space-y-2">
                <div className="flex flex-wrap gap-3">
                  <Lado p={par.a} />
                  <Lado p={par.b} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!!uniendo} onClick={() => unir(par.b, par.a)}>
                    {ocupado && uniendo === `${par.b.id}|${par.a.id}` && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Queda "{par.a.nombre}"
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!uniendo} onClick={() => unir(par.a, par.b)}>
                    {ocupado && uniendo === `${par.a.id}|${par.b.id}` && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Queda "{par.b.nombre}"
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!uniendo} onClick={() => descartar(par)}>No son iguales</Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicadosDialog;
