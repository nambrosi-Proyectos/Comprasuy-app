import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { BookMarked, ImagePlus, Library, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency } from '@/lib/utils';
import { imagenADataUrl } from '@/components/PresupuestoModal';

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nuevoId = () => `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const numero = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Ítem de un banco → ítem del pliego. */
const desdeBanco = (b) => ({
  id: nuevoId(), banco_id: b.id, nombre: b.nombre, descripcion: b.descripcion || '', imagen: b.imagen || null,
  cantidad: '', precio: b.precio ?? '', iva: b.iva ?? 22,
});

/** Cálculo de un ítem agregado a mano: precio unitario sin IVA + IVA. Sin precio, no suma al total. */
export const calcularItemExtra = (it) => {
  const precio = numero(it.precio);
  const cantidad = numero(it.cantidad);
  if (precio == null) return { ...it, sinPrecio: true, precioUnitarioSinIva: null, ivaUnitario: null, precioUnitarioConIva: null, totalItem: 0 };
  const iva = precio * ((numero(it.iva) ?? 22) / 100);
  return { ...it, sinPrecio: false, precioUnitarioSinIva: precio, ivaUnitario: iva, precioUnitarioConIva: precio + iva, totalItem: (precio + iva) * (cantidad ?? 1) };
};

const SubirImagen = ({ imagen, onChange }) => {
  const { toast } = useToast();
  const cargar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await imagenADataUrl(file));
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la imagen', description: err.message });
    }
  };
  return imagen ? (
    <div className="relative h-20 w-20 shrink-0">
      <img src={imagen} alt="" className="h-20 w-20 rounded-lg border bg-white object-contain" />
      <button type="button" onClick={() => onChange(null)} className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow text-slate-500 hover:text-red-600" title="Quitar imagen"><X className="h-4 w-4" /></button>
    </div>
  ) : (
    <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white text-[11px] font-semibold text-slate-500 hover:border-brand hover:text-brand">
      <ImagePlus className="h-5 w-5" /> Imagen
      <input type="file" accept="image/*" className="hidden" onChange={cargar} />
    </label>
  );
};

/** Lista del banco de ítems para elegir uno y agregarlo al pliego. */
const Banco = ({ banco, cargando, onElegir, onBorrar, yaEstan }) => {
  const [q, setQ] = useState('');
  const lista = useMemo(() => {
    const t = sinTildes(q).trim();
    return banco.filter((b) => !t || t.split(/\s+/).every((p) => sinTildes(`${b.nombre} ${b.descripcion || ''}`).includes(p)));
  }, [banco, q]);
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el banco de ítems…" className="pl-9 bg-white" autoFocus />
      </label>
      {cargando && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}
      {!cargando && !banco.length && <p className="text-sm text-slate-600">El banco está vacío. Agregá un ítem al pliego y tocá <b>Guardar en el banco</b> para reusarlo en otros llamados.</p>}
      {!cargando && !!banco.length && !lista.length && <p className="text-sm text-slate-600">No hay ítems con ese nombre.</p>}
      <div className="max-h-72 overflow-y-auto divide-y rounded-lg border bg-white">
        {lista.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-3 py-2">
            {b.imagen ? <img src={b.imagen} alt="" className="h-10 w-10 rounded border object-contain bg-white" /> : <div className="h-10 w-10 rounded border bg-slate-50" />}
            <button type="button" onClick={() => onElegir(b)} className="flex-1 text-left">
              <span className="font-medium">{b.nombre}</span>
              <span className="block text-xs text-slate-500 truncate">{b.precio != null ? `${formatCurrency(b.precio)} + IVA` : 'Sin precio'}{b.descripcion ? ` · ${b.descripcion}` : ''}</span>
            </button>
            {yaEstan.has(b.id) ? <span className="text-xs text-green-700 font-semibold">Ya está</span> : <Button size="sm" variant="outline" onClick={() => onElegir(b)}><Plus className="h-4 w-4" /></Button>}
            <button type="button" onClick={() => onBorrar(b)} className="p-1 text-slate-400 hover:text-red-600" title="Borrar del banco"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Ítems que se agregan a mano en la preparación del pliego: con o sin precio, con descripción e imagen.
 * Se pueden guardar en el banco de ítems para usarlos en otros llamados.
 */
const ItemsPliego = ({ items, onChange }) => {
  const { toast } = useToast();
  const [verBanco, setVerBanco] = useState(false);
  const [banco, setBanco] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(null);

  const cargarBanco = async () => {
    setCargando(true);
    const { data, error } = await supabase.from('items_banco').select('*').order('nombre', { ascending: true });
    setCargando(false);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo cargar el banco de ítems', description: error.message });
    setBanco(data || []);
  };
  useEffect(() => { if (verBanco) cargarBanco(); }, [verBanco]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (id, campo, valor) => onChange(items.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  const agregarNuevo = () => onChange([...items, { id: nuevoId(), banco_id: null, nombre: '', descripcion: '', imagen: null, cantidad: '', precio: '', iva: 22 }]);
  const agregarDelBanco = (b) => {
    if (items.some((it) => it.banco_id === b.id)) return;
    onChange([...items, desdeBanco(b)]);
    toast({ title: 'Ítem agregado', description: b.nombre });
  };
  const quitar = (id) => onChange(items.filter((it) => it.id !== id));

  const guardarEnBanco = async (it) => {
    if (!it.nombre.trim()) return toast({ variant: 'destructive', title: 'Falta el nombre del ítem' });
    setGuardando(it.id);
    const fila = { nombre: it.nombre.trim(), descripcion: it.descripcion?.trim() || null, imagen: it.imagen || null, precio: numero(it.precio), iva: numero(it.iva) ?? 22 };
    const { data, error } = it.banco_id
      ? await supabase.from('items_banco').update(fila).eq('id', it.banco_id).select().single()
      : await supabase.from('items_banco').insert(fila).select().single();
    setGuardando(null);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo guardar en el banco', description: error.message });
    onChange(items.map((x) => (x.id === it.id ? { ...x, banco_id: data.id } : x)));
    setBanco((prev) => [...prev.filter((b) => b.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    toast({ title: it.banco_id ? 'Ítem del banco actualizado' : 'Guardado en el banco de ítems', description: 'Lo vas a poder usar en otros llamados.' });
  };

  const borrarDelBanco = async (b) => {
    if (!window.confirm(`¿Borrar "${b.nombre}" del banco de ítems? Los pliegos que ya lo usan no cambian.`)) return;
    const { error } = await supabase.from('items_banco').delete().eq('id', b.id);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo borrar', description: error.message });
    setBanco((prev) => prev.filter((x) => x.id !== b.id));
    onChange(items.map((x) => (x.banco_id === b.id ? { ...x, banco_id: null } : x)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ítems agregados a mano</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={agregarNuevo}><Plus className="w-4 h-4 mr-1" /> Ítem nuevo</Button>
          <Button variant={verBanco ? 'default' : 'outline'} size="sm" onClick={() => setVerBanco((v) => !v)}><Library className="w-4 h-4 mr-1" /> Banco de ítems</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">Para ofrecer algo que no está en el presupuesto: solo nombre, descripción e imagen, o también con precio. Sin precio no suma al total.</p>

      {verBanco && <Banco banco={banco} cargando={cargando} onElegir={agregarDelBanco} onBorrar={borrarDelBanco} yaEstan={new Set(items.map((i) => i.banco_id).filter(Boolean))} />}

      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3 text-black space-y-2">
          <div className="flex gap-3">
            <SubirImagen imagen={it.imagen} onChange={(v) => cambiar(it.id, 'imagen', v)} />
            <div className="flex-1 space-y-2">
              <Input value={it.nombre} onChange={(e) => cambiar(it.id, 'nombre', e.target.value)} placeholder="Nombre del ítem" className="font-semibold" />
              <Textarea value={it.descripcion || ''} onChange={(e) => cambiar(it.id, 'descripcion', e.target.value)} placeholder="Descripción (opcional)" rows={2} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">Cantidad<Input inputMode="decimal" value={it.cantidad ?? ''} onChange={(e) => cambiar(it.id, 'cantidad', e.target.value)} placeholder="—" className="w-24" /></label>
            <label className="text-xs text-slate-500">Precio unit. s/IVA<Input inputMode="decimal" value={it.precio ?? ''} onChange={(e) => cambiar(it.id, 'precio', e.target.value)} placeholder="Sin precio" className="w-32" /></label>
            <label className="text-xs text-slate-500">IVA %<Input inputMode="decimal" value={it.iva ?? ''} onChange={(e) => cambiar(it.id, 'iva', e.target.value)} className="w-20" disabled={numero(it.precio) == null} /></label>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => guardarEnBanco(it)} disabled={guardando === it.id}>
                {guardando === it.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BookMarked className="w-4 h-4 mr-1" />}
                {it.banco_id ? 'Actualizar en el banco' : 'Guardar en el banco'}
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => quitar(it.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ItemsPliego;
