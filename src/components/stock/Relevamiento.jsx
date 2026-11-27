import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, ArrowRightLeft, Loader2, Minus, Plus, Save, Search } from 'lucide-react';
import { hoyISO, fechaCorta } from '@/lib/pagos';
import { contenidoUbicacion, formatoCantidad, nombreUbicacion, claveProducto } from '@/lib/stock';
import { ProductoBuscador, ProductoForm } from '@/components/stock/FormulariosStock';
import { guardarConteo, guardarProducto } from '@/components/stock/useStock';

const aNumero = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Conteo de un lugar (góndola, sala o depósito de proveedor). Arranca con lo que había,
 * se corrige lo que cambió y se agregan productos nuevos. Al guardar queda un conteo por producto.
 */
const Relevamiento = ({ ubicacion, ubicaciones, productos, movimientos, onVolver, onGuardado, onProductoCreado, onMover }) => {
  const { toast } = useToast();
  const porId = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const [lineas, setLineas] = useState([]);
  const [fecha, setFecha] = useState(hoyISO());
  const [filtro, setFiltro] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState(null); // nombre para crear producto
  const [guardando, setGuardando] = useState(false);

  // Al abrir el lugar: lo que hay hoy (no se vuelve a cargar si se guarda, para no perder lo escrito).
  useEffect(() => {
    const actual = contenidoUbicacion(ubicacion.id, movimientos);
    setLineas(
      [...actual.values()]
        .filter((s) => Math.abs(s.cantidad) > 0.0005)
        .map((s) => ({ producto_id: s.producto_id, anterior: s.cantidad, cantidad: String(s.cantidad), ultimoConteo: s.ultimoConteo }))
        .sort((a, b) => (prodPorId.get(a.producto_id)?.nombre || '').localeCompare(prodPorId.get(b.producto_id)?.nombre || '')),
    );
    setFecha(hoyISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicacion.id]);

  // Si mientras tanto se movió algo (botón Mover), se actualizan las filas que no se tocaron.
  useEffect(() => {
    const actual = contenidoUbicacion(ubicacion.id, movimientos);
    setLineas((ls) => ls.map((l) => {
      const s = actual.get(l.producto_id);
      const hoy = s ? s.cantidad : 0;
      if (l.nuevo || hoy === l.anterior || aNumero(l.cantidad) !== l.anterior) return l;
      return { ...l, anterior: hoy, cantidad: String(hoy) };
    }));
  }, [movimientos, ubicacion.id]);

  const setCantidad = (id, valor) => setLineas((ls) => ls.map((l) => (l.producto_id === id ? { ...l, cantidad: valor } : l)));
  const sumar = (id, d) => setLineas((ls) => ls.map((l) => (l.producto_id === id ? { ...l, cantidad: String(Math.max(0, aNumero(l.cantidad) + d)) } : l)));
  const agregar = (p) => {
    setLineas((ls) => (ls.some((l) => l.producto_id === p.id) ? ls : [{ producto_id: p.id, anterior: 0, cantidad: '', nuevo: true }, ...ls]));
    setAgregando(false);
  };

  const cambios = lineas.filter((l) => aNumero(l.cantidad) !== l.anterior).length;
  const q = claveProducto(filtro);
  const visibles = lineas.filter((l) => !q || (prodPorId.get(l.producto_id)?.clave || '').includes(q));

  const guardar = async () => {
    setGuardando(true);
    try {
      const filas = await guardarConteo({ ubicacion, fecha, movimientos, lineas: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: aNumero(l.cantidad) })) });
      onGuardado(filas);
      setLineas((ls) => ls.map((l) => ({ ...l, anterior: aNumero(l.cantidad), nuevo: false })));
      toast({ title: `Conteo de ${ubicacion.nombre} guardado`, description: `${lineas.length} productos, ${cambios} con cambios.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el conteo', description: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const crearProducto = async (valores) => {
    try {
      const p = await guardarProducto(valores);
      onProductoCreado(p);
      agregar(p);
      setNuevo(null);
      toast({ title: 'Producto creado', description: p.nombre });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo crear el producto', description: e.message });
    }
  };

  const tieneGondolas = ubicacion.tipo === 'sala' && ubicaciones.some((u) => u.padre_id === ubicacion.id && u.activo !== false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onVolver}><ArrowLeft className="mr-1 h-4 w-4" /> Lugares</Button>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-bold text-ink">{ubicacion.tipo === 'proveedor' ? `Afuera · ${ubicacion.nombre}` : nombreUbicacion(ubicacion, porId)}</h2>
          {tieneGondolas && <p className="text-xs text-slate-500">Lo que está en el piso de la sala, fuera de las góndolas.</p>}
        </div>
        <label className="text-sm flex items-center gap-2">Fecha <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" /></label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={agregando ? 'default' : 'outline'} onClick={() => setAgregando((v) => !v)}><Plus className="mr-1 h-4 w-4" /> Agregar producto</Button>
        {lineas.length > 8 && (
          <label className="relative block flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar esta lista…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand" />
          </label>
        )}
      </div>
      {agregando && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <ProductoBuscador productos={productos} excluir={lineas.map((l) => l.producto_id)} onElegir={agregar} onCrear={(nombre) => setNuevo(nombre)} autoFocus placeholder="Buscá el producto para agregarlo acá…" />
        </div>
      )}

      {!lineas.length && <p className="rounded-xl border border-dashed p-6 text-center text-slate-500">Este lugar está vacío. Tocá <b>Agregar producto</b> para empezar a contar.</p>}

      <div className="divide-y rounded-xl border border-slate-200 bg-white">
        {visibles.map((l) => {
          const p = prodPorId.get(l.producto_id);
          const cambio = aNumero(l.cantidad) !== l.anterior;
          return (
            <div key={l.producto_id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${cambio ? 'bg-amber-50' : ''}`}>
              <div className="flex-1 min-w-[160px]">
                <p className="font-medium leading-tight">{p?.nombre || 'Producto borrado'}</p>
                <p className="text-xs text-slate-500">
                  {l.nuevo ? 'Nuevo en este lugar' : `Había ${formatoCantidad(l.anterior)}${l.ultimoConteo ? ` · contado el ${fechaCorta(l.ultimoConteo)}` : ''}`}
                  {p?.unidad ? ` · ${p.unidad}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => sumar(l.producto_id, -1)} aria-label="Restar uno"><Minus className="h-5 w-5" /></Button>
                <Input inputMode="decimal" value={l.cantidad} onChange={(e) => setCantidad(l.producto_id, e.target.value)} onFocus={(e) => e.target.select()} className="h-11 w-24 text-center text-lg font-bold tabular-nums" aria-label={`Cantidad de ${p?.nombre}`} />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => sumar(l.producto_id, 1)} aria-label="Sumar uno"><Plus className="h-5 w-5" /></Button>
              </div>
              {!l.nuevo && l.anterior > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onMover(p, ubicacion)} title="Mover a otro lugar"><ArrowRightLeft className="mr-1 h-4 w-4" /> Mover</Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-sm text-slate-600 flex-1">{lineas.length} productos · {cambios ? <b className="text-amber-700">{cambios} con cambios</b> : 'sin cambios'}</span>
        <Button onClick={guardar} disabled={guardando || !lineas.length} size="lg">
          {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar conteo
        </Button>
      </div>

      <ProductoForm open={nuevo != null} inicial={nuevo != null ? { nombre: nuevo } : null} onClose={() => setNuevo(null)} onSave={crearProducto} />
    </div>
  );
};

export default Relevamiento;
