import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import { hoyISO } from '@/lib/pagos';
import { CATEGORIAS, UNIDADES, TIPOS_UBICACION, nombreUbicacion, ubicacionesOrdenadas, formatoCantidad, contenidoUbicacion, claveProducto } from '@/lib/stock';

export const selectClase = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const aNumero = (v) => (v === '' || v == null ? '' : parseFloat(String(v).replace(',', '.')) || 0);

export const Campo = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label>{label}</Label>
    {children}
  </div>
);

const Pie = ({ onClose, saving, texto, extra, disabled }) => (
  <DialogFooter className="gap-2 sm:gap-0 pt-2">
    {extra}
    <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
    <Button type="submit" disabled={saving || disabled}>
      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {texto}
    </Button>
  </DialogFooter>
);

const useEnvio = (onSave, valores) => {
  const [saving, setSaving] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(valores());
    } finally {
      setSaving(false);
    }
  };
  return [saving, enviar];
};

/** Selector de lugar con salas y góndolas anidadas. */
export const UbicacionSelect = ({ value, onChange, ubicaciones, excluir, placeholder = 'Elegí un lugar', required = true }) => {
  const porId = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={selectClase} required={required}>
      <option value="">{placeholder}</option>
      {ubicacionesOrdenadas(ubicaciones).filter((u) => u.id !== excluir).map((u) => (
        <option key={u.id} value={u.id}>
          {u.nivel ? '   ↳ ' : ''}{u.tipo === 'proveedor' ? `Afuera · ${u.nombre}` : nombreUbicacion(u, porId)}
        </option>
      ))}
    </select>
  );
};

/** Buscador de productos: escribís y elegís de la lista. */
export const ProductoBuscador = ({ productos, onElegir, onCrear, excluir = [], autoFocus, placeholder = 'Buscar producto…' }) => {
  const [q, setQ] = useState('');
  const clave = claveProducto(q);
  const resultados = useMemo(() => {
    if (!clave) return [];
    const partes = clave.split(' ');
    return productos
      .filter((p) => p.activo !== false && !excluir.includes(p.id))
      .filter((p) => { const t = [p.clave, ...(p.alias || [])].join(' '); return partes.every((x) => t.includes(x)); })
      .slice(0, 12);
  }, [productos, clave, excluir]);
  const existeIgual = productos.some((p) => p.clave === clave);
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" />
      </label>
      {clave && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y">
          {resultados.map((p) => (
            <button key={p.id} type="button" onClick={() => { onElegir(p); setQ(''); }} className="w-full text-left px-3 py-2.5 hover:bg-orange-50">
              <span className="font-medium">{p.nombre}</span>
              <span className="ml-2 text-xs text-slate-500">{p.categoria}{p.unidad ? ` · ${p.unidad}` : ''}</span>
            </button>
          ))}
          {!resultados.length && <p className="px-3 py-2.5 text-sm text-slate-500">No hay productos con ese nombre.</p>}
          {onCrear && !existeIgual && (
            <button type="button" onClick={() => { onCrear(q.trim()); setQ(''); }} className="w-full text-left px-3 py-2.5 font-semibold text-brand hover:bg-orange-50">
              + Crear producto nuevo "{q.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Producto ----------

const PRODUCTO_VACIO = { nombre: '', categoria: 'Alimentos', unidad: 'unidad', stock_minimo: '', costo: '', notas: '', activo: true };

export const ProductoForm = ({ open, inicial, onClose, onSave, onUnir }) => {
  const [form, setForm] = useState(PRODUCTO_VACIO);
  useEffect(() => {
    if (open) setForm({ ...PRODUCTO_VACIO, ...(inicial || {}), stock_minimo: inicial?.stock_minimo ?? '', costo: inicial?.costo ?? '', unidad: inicial?.unidad || 'unidad' });
  }, [open, inicial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const [saving, enviar] = useEnvio(onSave, () => ({ ...form, stock_minimo: aNumero(form.stock_minimo), costo: aNumero(form.costo) }));
  const editando = !!inicial?.id;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar producto' : 'Producto nuevo'}</DialogTitle>
          {editando && inicial.alias?.length > 1 && <DialogDescription>También aparece como: {inicial.alias.filter((a) => a !== inicial.clave).join(' · ')}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={enviar} className="grid grid-cols-2 gap-3">
          <Campo label="Nombre" className="col-span-2"><Input value={form.nombre} onChange={set('nombre')} required autoFocus /></Campo>
          <Campo label="Categoría">
            <Input list="stock-categorias" value={form.categoria || ''} onChange={set('categoria')} />
            <datalist id="stock-categorias">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo label="Unidad">
            <Input list="stock-unidades" value={form.unidad || ''} onChange={set('unidad')} />
            <datalist id="stock-unidades">{UNIDADES.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo label="Stock mínimo"><Input inputMode="decimal" value={form.stock_minimo} onChange={set('stock_minimo')} /></Campo>
          <Campo label="Costo por unidad ($)"><Input inputMode="decimal" value={form.costo} onChange={set('costo')} /></Campo>
          <Campo label="Notas" className="col-span-2"><Input value={form.notas || ''} onChange={set('notas')} /></Campo>
          {editando && (
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.activo !== false} onChange={set('activo')} /> Producto activo (si no se trabaja más, destildalo)
            </label>
          )}
          <div className="col-span-2">
            <Pie onClose={onClose} saving={saving} texto="Guardar" extra={editando && onUnir && <Button type="button" variant="ghost" className="mr-auto" onClick={() => onUnir(inicial)}>Unir con otro…</Button>} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Lugar ----------

const UBIC_VACIA = { nombre: '', tipo: 'sala', padre_id: '', proveedor_id: '', notas: '' };

export const UbicacionForm = ({ open, inicial, ubicaciones, proveedores, onClose, onSave, onArchivar }) => {
  const [form, setForm] = useState(UBIC_VACIA);
  useEffect(() => { if (open) setForm({ ...UBIC_VACIA, ...(inicial || {}), padre_id: inicial?.padre_id || '', proveedor_id: inicial?.proveedor_id || '' }); }, [open, inicial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [saving, enviar] = useEnvio(onSave, () => form);
  const salas = ubicaciones.filter((u) => u.tipo === 'sala' && u.activo !== false && u.id !== inicial?.id);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial?.id ? 'Editar lugar' : 'Lugar nuevo'}</DialogTitle>
          <DialogDescription>Las salas pueden tener góndolas adentro. Si una sala no tiene góndolas, se cuenta entera.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          {inicial?.tipo !== 'sin_ubicar' && (
            <Campo label="Tipo">
              <select value={form.tipo} onChange={set('tipo')} className={selectClase}>
                {['sala', 'gondola', 'proveedor'].map((t) => <option key={t} value={t}>{TIPOS_UBICACION[t]}</option>)}
              </select>
            </Campo>
          )}
          {form.tipo === 'gondola' && (
            <Campo label="Sala">
              <select value={form.padre_id} onChange={set('padre_id')} className={selectClase} required>
                <option value="">Elegí la sala</option>
                {salas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Nombre">
            <Input value={form.nombre} onChange={set('nombre')} required autoFocus placeholder={form.tipo === 'sala' ? 'Sala 1, Galpón, Cámara…' : form.tipo === 'gondola' ? 'Góndola A' : 'Nombre del proveedor'} />
          </Campo>
          {form.tipo === 'proveedor' && (
            <Campo label="Proveedor (de Pagos)">
              <select value={form.proveedor_id} onChange={set('proveedor_id')} className={selectClase}>
                <option value="">Sin vincular</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Notas"><Input value={form.notas || ''} onChange={set('notas')} /></Campo>
          <Pie onClose={onClose} saving={saving} texto="Guardar" extra={onArchivar && <Button type="button" variant="ghost" className="mr-auto text-red-600" onClick={onArchivar}>Archivar</Button>} />
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Entrada / salida ----------

export const MovimientoForm = ({ open, inicial, productos, ubicaciones, onClose, onSave }) => {
  const [form, setForm] = useState({ cantidad: '', fecha: '', nota: '', referencia: '', costo: '' });
  useEffect(() => {
    if (open) setForm({ tipo: 'entrada', producto_id: '', ubicacion_id: '', cantidad: '', costo: '', referencia: '', nota: '', fecha: hoyISO(), ...(inicial || {}) });
  }, [open, inicial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const producto = productos.find((p) => p.id === form.producto_id);
  const [saving, enviar] = useEnvio(onSave, () => ({ ...form, cantidad: aNumero(form.cantidad), costo: aNumero(form.costo) }));
  const titulo = { entrada: 'Registrar entrada', salida: 'Registrar salida', ajuste: 'Ajuste' }[form.tipo] || 'Movimiento';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{form.tipo === 'salida' ? 'Mercadería que sale del depósito (entrega, venta, licitación).' : 'Mercadería que llega (compra, devolución).'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex gap-2">
            {['entrada', 'salida'].map((t) => (
              <Button key={t} type="button" variant={form.tipo === t ? 'default' : 'outline'} className="flex-1" onClick={() => setForm((f) => ({ ...f, tipo: t }))}>
                {t === 'entrada' ? 'Entrada' : 'Salida'}
              </Button>
            ))}
          </div>
          <Campo label="Producto" className="col-span-2">
            {producto ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <b>{producto.nombre}</b>
                <button type="button" className="text-sm text-brand" onClick={() => setForm((f) => ({ ...f, producto_id: '' }))}>Cambiar</button>
              </div>
            ) : (
              <ProductoBuscador productos={productos} onElegir={(p) => setForm((f) => ({ ...f, producto_id: p.id, costo: f.costo || p.costo || '' }))} autoFocus />
            )}
          </Campo>
          <Campo label={form.tipo === 'salida' ? 'Sale de' : 'Entra a'} className="col-span-2">
            <UbicacionSelect value={form.ubicacion_id} onChange={(v) => setForm((f) => ({ ...f, ubicacion_id: v }))} ubicaciones={ubicaciones} />
          </Campo>
          <Campo label={`Cantidad${producto?.unidad ? ` (${producto.unidad})` : ''}`}><Input inputMode="decimal" value={form.cantidad} onChange={set('cantidad')} required /></Campo>
          <Campo label="Fecha"><Input type="date" value={form.fecha} onChange={set('fecha')} required /></Campo>
          {form.tipo === 'entrada' && <Campo label="Costo por unidad ($)"><Input inputMode="decimal" value={form.costo} onChange={set('costo')} /></Campo>}
          <Campo label={form.tipo === 'salida' ? 'Para (cliente, licitación, OC)' : 'Factura o proveedor'} className={form.tipo === 'entrada' ? '' : 'col-span-2'}>
            <Input value={form.referencia} onChange={set('referencia')} />
          </Campo>
          <Campo label="Nota" className="col-span-2"><Input value={form.nota} onChange={set('nota')} /></Campo>
          <div className="col-span-2"><Pie onClose={onClose} saving={saving} disabled={!form.producto_id} texto="Guardar" /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Mover ----------

export const MoverForm = ({ open, inicial, productos, ubicaciones, movimientos, onClose, onSave }) => {
  const [form, setForm] = useState({ cantidad: '', fecha: '', nota: '', referencia: '', costo: '' });
  useEffect(() => {
    if (open) setForm({ producto_id: '', origen_id: '', destino_id: '', cantidad: '', fecha: hoyISO(), nota: '', ...(inicial || {}) });
  }, [open, inicial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const producto = productos.find((p) => p.id === form.producto_id);
  const disponible = useMemo(() => {
    if (!form.producto_id || !form.origen_id) return null;
    return contenidoUbicacion(form.origen_id, movimientos).get(form.producto_id)?.cantidad ?? 0;
  }, [form.producto_id, form.origen_id, movimientos]);
  const [saving, enviar] = useEnvio(onSave, () => ({ ...form, cantidad: aNumero(form.cantidad) }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover {producto ? producto.nombre : 'producto'}</DialogTitle>
          <DialogDescription>Pasa mercadería de un lugar a otro. El total no cambia.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid grid-cols-2 gap-3">
          {!producto && (
            <Campo label="Producto" className="col-span-2">
              <ProductoBuscador productos={productos} onElegir={(p) => setForm((f) => ({ ...f, producto_id: p.id }))} autoFocus />
            </Campo>
          )}
          <Campo label="Desde" className="col-span-2">
            <UbicacionSelect value={form.origen_id} onChange={(v) => setForm((f) => ({ ...f, origen_id: v }))} ubicaciones={ubicaciones} />
          </Campo>
          <Campo label="Hacia" className="col-span-2">
            <UbicacionSelect value={form.destino_id} onChange={(v) => setForm((f) => ({ ...f, destino_id: v }))} ubicaciones={ubicaciones} excluir={form.origen_id} />
          </Campo>
          <Campo label="Cantidad">
            <div className="flex gap-2">
              <Input inputMode="decimal" value={form.cantidad} onChange={set('cantidad')} required />
              {disponible > 0 && <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, cantidad: String(disponible) }))}>Todo</Button>}
            </div>
            {disponible != null && <p className="text-xs text-slate-500">Hay {formatoCantidad(disponible)} en el origen.</p>}
          </Campo>
          <Campo label="Fecha"><Input type="date" value={form.fecha} onChange={set('fecha')} required /></Campo>
          <Campo label="Nota" className="col-span-2"><Input value={form.nota} onChange={set('nota')} /></Campo>
          <div className="col-span-2"><Pie onClose={onClose} saving={saving} disabled={!form.producto_id} texto="Mover" /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Unir productos ----------

export const UnirDialog = ({ origen, productos, onClose, onUnir }) => {
  const [destino, setDestino] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDestino(null); }, [origen?.id]);
  if (!origen) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Unir "{origen.nombre}" con otro producto</DialogTitle>
          <DialogDescription>Usalo cuando el mismo producto quedó con dos nombres. Todo su stock e histórico pasa al producto que elijas, y "{origen.nombre}" se borra.</DialogDescription>
        </DialogHeader>
        {destino ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span>Queda como <b>{destino.nombre}</b></span>
            <button type="button" className="text-sm text-brand" onClick={() => setDestino(null)}>Cambiar</button>
          </div>
        ) : (
          <ProductoBuscador productos={productos} excluir={[origen.id]} onElegir={setDestino} autoFocus placeholder="Buscar el producto que queda…" />
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!destino || saving} onClick={async () => { setSaving(true); try { await onUnir(origen, destino); } finally { setSaving(false); } }}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Unir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
