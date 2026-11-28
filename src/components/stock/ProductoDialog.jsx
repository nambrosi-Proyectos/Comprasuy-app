import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, LogIn, LogOut, Pencil, Trash2 } from 'lucide-react';
import { fechaCorta, formatoMonto } from '@/lib/pagos';
import { TIPOS_MOVIMIENTO, formatoCantidad, nombreUbicacion, nombreMes } from '@/lib/stock';
import PreciosVenta from '@/components/stock/PreciosVenta';

const colorTipo = { conteo: 'bg-slate-100 text-slate-700', entrada: 'bg-green-100 text-green-800', salida: 'bg-red-100 text-red-800', traslado: 'bg-sky-100 text-sky-800', ajuste: 'bg-amber-100 text-amber-800' };

/** Detalle de un producto: dónde está, cómo evolucionó mes a mes y sus últimos movimientos. */
const ProductoDialog = ({ fila, ubicaciones, movimientos, cierres, onClose, onEditar, onMover, onMovimiento, onBorrarMov, precios = [], esAdmin, onGuardarPrecio, onBorrarPrecio }) => {
  const porId = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const p = fila?.producto;
  const historia = useMemo(() => {
    if (!p) return [];
    return cierres.map((c) => {
      const it = (c.items || []).find((x) => x.p === p.id);
      return { mes: c.mes, d: it?.d || 0, a: it?.a || 0 };
    });
  }, [cierres, p]);
  const maxHist = Math.max(1, ...historia.map((h) => h.d + h.a));
  const movs = useMemo(() => (p ? movimientos.filter((m) => m.producto_id === p.id).slice().reverse().slice(0, 40) : []), [movimientos, p]);
  if (!fila) return null;
  const unidad = p.unidad ? ` ${p.unidad}` : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {p.nombre}
            <button type="button" onClick={() => onEditar(p)} className="text-slate-400 hover:text-brand" title="Editar producto"><Pencil className="h-4 w-4" /></button>
          </DialogTitle>
          <DialogDescription>{[p.categoria, p.unidad, p.notas].filter(Boolean).join(' · ') || 'Producto'}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Total', formatoCantidad(fila.total) + unidad, fila.bajoMinimo ? 'bg-red-50 border-red-200' : 'bg-white'],
            ['En el depósito', formatoCantidad(fila.dentro), 'bg-white'],
            ['Afuera', formatoCantidad(fila.afuera), 'bg-white'],
            ['Valor', formatoMonto(fila.valor), 'bg-white'],
          ].map(([t, v, c]) => (
            <div key={t} className={`rounded-xl border px-3 py-2 ${c}`}>
              <span className="text-xs font-semibold text-slate-500">{t}</span>
              <b className="block text-lg tabular-nums">{v}</b>
            </div>
          ))}
        </div>
        {fila.bajoMinimo && <p className="text-sm text-red-700">Está por debajo del mínimo ({formatoCantidad(p.stock_minimo)}).</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onMovimiento('entrada', p)}><LogIn className="mr-2 h-4 w-4" /> Entrada</Button>
          <Button variant="outline" size="sm" onClick={() => onMovimiento('salida', p)}><LogOut className="mr-2 h-4 w-4" /> Salida</Button>
          <Button variant="outline" size="sm" onClick={() => onMover(p, fila.lugares[0]?.ubicacion)}><ArrowRightLeft className="mr-2 h-4 w-4" /> Mover</Button>
        </div>

        <PreciosVenta productoId={p.id} precios={precios} esAdmin={esAdmin} onGuardar={onGuardarPrecio} onBorrar={onBorrarPrecio} />

        <section>
          <h3 className="font-semibold text-ink mb-2">Dónde está</h3>
          {!fila.lugares.length && <p className="text-sm text-slate-500">Sin stock en ningún lugar.</p>}
          <div className="divide-y rounded-xl border">
            {fila.lugares.map((l) => (
              <div key={l.ubicacion.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1">
                  {l.ubicacion.tipo === 'proveedor' ? `Afuera · ${l.ubicacion.nombre}` : nombreUbicacion(l.ubicacion, porId)}
                  {l.ultimoConteo && <span className="block text-xs text-slate-500">Contado el {fechaCorta(l.ultimoConteo)}</span>}
                </span>
                <b className="tabular-nums">{formatoCantidad(l.cantidad)}</b>
                <Button variant="ghost" size="sm" onClick={() => onMover(p, l.ubicacion)}><ArrowRightLeft className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </section>

        {historia.some((h) => h.d || h.a) && (
          <section>
            <h3 className="font-semibold text-ink mb-2">Histórico al cierre de cada mes</h3>
            <div className="space-y-1">
              {historia.map((h) => (
                <div key={h.mes} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 capitalize text-slate-600">{nombreMes(h.mes)}</span>
                  <div className="flex-1 flex h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="bg-brand" style={{ width: `${(h.d / maxHist) * 100}%` }} title={`Depósito: ${formatoCantidad(h.d)}`} />
                    <div className="bg-sky-400" style={{ width: `${(h.a / maxHist) * 100}%` }} title={`Afuera: ${formatoCantidad(h.a)}`} />
                  </div>
                  <span className="w-20 text-right tabular-nums">{formatoCantidad(h.d + h.a)}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500"><span className="inline-block h-2 w-3 bg-brand mr-1" />Depósito <span className="inline-block h-2 w-3 bg-sky-400 ml-3 mr-1" />Afuera</p>
          </section>
        )}

        <section>
          <h3 className="font-semibold text-ink mb-2">Últimos movimientos</h3>
          {!movs.length && <p className="text-sm text-slate-500">Todavía no hay movimientos.</p>}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t first:border-t-0">
                    <td className="px-3 py-2 whitespace-nowrap">{fechaCorta(m.fecha)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorTipo[m.tipo] || ''}`}>{TIPOS_MOVIMIENTO[m.tipo] || m.tipo}</span></td>
                    <td className="px-3 py-2">
                      {nombreUbicacion(porId.get(m.ubicacion_id), porId)}
                      {((m.referencia && m.referencia !== 'sale') || m.nota) && <span className="block text-xs text-slate-500">{[m.referencia !== 'sale' && m.referencia, m.nota].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                      {m.tipo === 'conteo' ? `= ${formatoCantidad(m.cantidad)}` : `${m.cantidad > 0 ? '+' : ''}${formatoCantidad(m.cantidad)}`}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => onBorrarMov(m)} className="p-1 text-slate-400 hover:text-red-600" title="Borrar movimiento"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
};

export default ProductoDialog;
