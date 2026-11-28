import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { formatoMonto } from '@/lib/pagos';

export const LISTAS_VENTA = { comercio: 'Comercios', institucion: 'Instituciones', remar: 'REMAR' };
const selectClase = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

/** Precios de venta del producto en cada lista de Ventas (SVC). El stock es uno solo para todas las listas. */
const PreciosVenta = ({ productoId, precios, esAdmin, onGuardar, onBorrar }) => {
  const [form, setForm] = useState(null); // { valores, existente }
  const [guardando, setGuardando] = useState(false);
  const listas = Object.keys(LISTAS_VENTA).filter((l) => esAdmin || l !== 'remar');
  const usadas = new Set(precios.map((p) => p.lista));
  const libres = listas.filter((l) => !usadas.has(l));

  const abrir = (existente) => setForm({
    existente,
    valores: existente
      ? { lista: existente.lista, codigo: existente.codigo || '', precio: String(existente.precio ?? ''), iva: String(existente.iva ?? 22) }
      : { lista: libres[0], codigo: '', precio: '', iva: '22' },
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, valores: { ...f.valores, [k]: e.target.value } }));
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const ok = await onGuardar({ ...form.valores, producto_id: productoId }, form.existente);
    setGuardando(false);
    if (ok) setForm(null);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-ink flex items-center gap-1.5"><ShoppingCart className="h-4 w-4" /> Precios de venta (SVC)</h3>
        {!form && libres.length > 0 && <Button variant="outline" size="sm" onClick={() => abrir(null)}><Plus className="mr-1 h-4 w-4" /> Agregar a una lista</Button>}
      </div>
      {!precios.length && !form && <p className="text-sm text-slate-500">No se vende en Ventas (SVC). Agregalo a una lista para que los vendedores lo vean.</p>}
      {!!precios.length && (
        <div className="divide-y rounded-xl border">
          {precios.sort((a, b) => a.lista.localeCompare(b.lista)).map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1">
                <b>{LISTAS_VENTA[p.lista] || p.lista}</b>
                <span className="block text-xs text-slate-500">{p.codigo ? `Código ${p.codigo} · ` : ''}IVA {p.iva}%</span>
              </span>
              <b className="tabular-nums">{formatoMonto(p.precio)}</b>
              <button type="button" onClick={() => abrir(p)} className="p-1 text-slate-400 hover:text-brand" title="Editar precio"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => onBorrar(p)} className="p-1 text-slate-400 hover:text-red-600" title="Sacar de esta lista"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {form && (
        <form onSubmit={guardar} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
          <label className="text-xs text-slate-600">Lista
            <select value={form.valores.lista} onChange={set('lista')} className={`${selectClase} block`} disabled={!!form.existente}>
              {(form.existente ? [form.existente.lista] : libres).map((l) => <option key={l} value={l}>{LISTAS_VENTA[l]}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">Código<Input value={form.valores.codigo} onChange={set('codigo')} className="w-28 bg-white" /></label>
          <label className="text-xs text-slate-600">Precio con IVA<Input inputMode="decimal" value={form.valores.precio} onChange={set('precio')} required className="w-28 bg-white" autoFocus /></label>
          <label className="text-xs text-slate-600">IVA
            <select value={form.valores.iva} onChange={set('iva')} className={`${selectClase} block`}>
              <option value="22">22%</option><option value="10">10%</option><option value="0">Exento</option>
            </select>
          </label>
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
          </div>
        </form>
      )}
    </section>
  );
};

export default PreciosVenta;
