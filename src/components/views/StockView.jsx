import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Plus, Upload, Search, Pencil, Package, Warehouse, BarChart3, ArrowRightLeft, LogIn, AlertTriangle,
  Truck, ClipboardList, CalendarCheck,
} from 'lucide-react';
import { fechaCorta, formatoMonto, hoyISO } from '@/lib/pagos';
import {
  resumenStock, totalesStock, itemsCierre, valorCierre, formatoCantidad, nombreMes, ubicacionesOrdenadas,
  contenidoUbicacion, claveProducto, CATEGORIAS,
} from '@/lib/stock';
import { useStock, guardarProducto, moverStock, registrarMovimiento, unirProductos } from '@/components/stock/useStock';
import { importarPlanillaStock } from '@/components/stock/importarStock';
import { ProductoForm, UbicacionForm, MovimientoForm, MoverForm, UnirDialog } from '@/components/stock/FormulariosStock';
import ProductoDialog from '@/components/stock/ProductoDialog';
import Relevamiento from '@/components/stock/Relevamiento';

const PAGINA = 80;

const TABS = [
  { id: 'stock', label: 'Stock actual', icon: Package },
  { id: 'deposito', label: 'Depósito y conteo', icon: Warehouse },
  { id: 'historico', label: 'Histórico', icon: BarChart3 },
];

const selectClase = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand';

const Tarjeta = ({ icon: Icon, titulo, valor, detalle, tono = 'bg-white border-slate-200 text-ink', onClick }) => (
  <button type="button" onClick={onClick} className={`text-left rounded-xl border p-4 transition-colors ${onClick ? 'hover:border-brand' : 'cursor-default'} ${tono}`}>
    <span className="text-[13px] font-semibold flex items-center gap-1.5"><Icon className="h-4 w-4" /> {titulo}</span>
    <b className="block text-xl mt-1 tabular-nums">{valor}</b>
    {detalle && <p className="text-xs mt-1 opacity-75">{detalle}</p>}
  </button>
);

const StockView = () => {
  const { toast } = useToast();
  const { productos, ubicaciones, movimientos, cierres, setProductos, setUbicaciones, setMovimientos, setCierres, loading, error, recargar } = useStock();
  const [tab, setTab] = useState('stock');
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [vista, setVista] = useState('con');
  const [visibles, setVisibles] = useState(PAGINA);
  const [proveedores, setProveedores] = useState([]);
  const [detalleId, setDetalleId] = useState(null);
  const [productoForm, setProductoForm] = useState(null); // { inicial }
  const [ubicForm, setUbicForm] = useState(null);
  const [movForm, setMovForm] = useState(null);
  const [moverForm, setMoverForm] = useState(null);
  const [unir, setUnir] = useState(null);
  const [relevando, setRelevando] = useState(null); // id del lugar
  const [aBorrar, setABorrar] = useState(null);
  const [cerrarMes, setCerrarMes] = useState(false);
  const [importando, setImportando] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from('proveedores').select('id, nombre').order('nombre', { ascending: true }).then(({ data }) => setProveedores(data || []));
  }, []);

  const resumen = useMemo(() => resumenStock(productos, ubicaciones, movimientos), [productos, ubicaciones, movimientos]);
  const totales = useMemo(() => totalesStock(resumen), [resumen]);
  const porProducto = useMemo(() => new Map(resumen.map((r) => [r.producto.id, r])), [resumen]);
  const categorias = useMemo(() => [...new Set([...CATEGORIAS, ...productos.map((p) => p.categoria).filter(Boolean)])], [productos]);
  const query = claveProducto(q);

  const filas = useMemo(() => resumen
    .filter((r) => (vista === 'inactivos' ? r.producto.activo === false : r.producto.activo !== false))
    .filter((r) => vista !== 'con' || Math.abs(r.total) > 0.0005)
    .filter((r) => vista !== 'minimo' || r.bajoMinimo)
    .filter((r) => categoria === 'todas' || r.producto.categoria === categoria)
    .filter((r) => !query || query.split(' ').every((x) => [r.producto.clave, ...(r.producto.alias || [])].join(' ').includes(x)))
    .sort((a, b) => (a.producto.categoria || '').localeCompare(b.producto.categoria || '') || a.producto.nombre.localeCompare(b.producto.nombre)),
  [resumen, vista, categoria, query]);

  const lugares = useMemo(() => ubicacionesOrdenadas(ubicaciones).map((u) => {
    const cont = [...contenidoUbicacion(u.id, movimientos).values()];
    const conStock = cont.filter((s) => Math.abs(s.cantidad) > 0.0005);
    const ultimo = cont.map((s) => s.ultimoConteo).filter(Boolean).sort().pop();
    return { ...u, productos: conStock.length, ultimoConteo: ultimo };
  }), [ubicaciones, movimientos]);

  const sumarMovs = (nuevos) => setMovimientos((prev) => [...prev, ...nuevos]);
  const ponerProducto = (p) => setProductos((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));

  // ---------- Acciones ----------
  const guardarProd = async (v) => {
    try {
      const p = await guardarProducto(v, productoForm.inicial?.id ? productoForm.inicial : null);
      ponerProducto(p);
      setProductoForm(null);
      toast({ title: productoForm.inicial?.id ? 'Producto guardado' : 'Producto creado', description: p.nombre });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el producto', description: e.message });
    }
  };

  const guardarUbic = async (v) => {
    try {
      const fila = {
        nombre: v.nombre.trim(), tipo: v.tipo, padre_id: v.tipo === 'gondola' ? v.padre_id || null : null,
        proveedor_id: v.tipo === 'proveedor' ? v.proveedor_id || null : null, notas: v.notas?.trim() || null,
        orden: ubicForm.inicial?.orden ?? (v.tipo === 'proveedor' ? 500 : ubicaciones.length),
      };
      const nuevo = !ubicForm.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('stock_ubicaciones').insert(fila).select().single()
        : await supabase.from('stock_ubicaciones').update(fila).eq('id', ubicForm.inicial.id).select().single();
      if (err) throw err;
      setUbicaciones((prev) => (nuevo ? [...prev, data] : prev.map((u) => (u.id === data.id ? data : u))));
      setUbicForm(null);
      toast({ title: nuevo ? 'Lugar creado' : 'Lugar guardado', description: data.nombre });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el lugar', description: e.message });
    }
  };

  const archivarUbic = async (u) => {
    if (u.productos) return toast({ variant: 'destructive', title: 'Ese lugar tiene mercadería', description: 'Movela a otro lugar o contalo en 0 antes de archivarlo.' });
    const { data, error: err } = await supabase.from('stock_ubicaciones').update({ activo: false }).eq('id', u.id).select().single();
    if (err) return toast({ variant: 'destructive', title: 'No se pudo archivar', description: err.message });
    setUbicaciones((prev) => prev.map((x) => (x.id === data.id ? data : x)));
    setUbicForm(null);
    toast({ title: 'Lugar archivado', description: u.nombre });
  };

  const guardarMov = async (v) => {
    try {
      const { movimiento, producto } = await registrarMovimiento(v);
      sumarMovs([movimiento]);
      if (producto) ponerProducto(producto);
      setMovForm(null);
      toast({ title: v.tipo === 'salida' ? 'Salida registrada' : 'Entrada registrada' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    }
  };

  const guardarMover = async (v) => {
    try {
      sumarMovs(await moverStock(v));
      setMoverForm(null);
      toast({ title: 'Mercadería movida' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo mover', description: e.message });
    }
  };

  const hacerUnion = async (origen, destino) => {
    try {
      const actualizado = await unirProductos(origen, destino, cierres);
      setUnir(null);
      setProductoForm(null);
      setDetalleId(actualizado.id);
      await recargar();
      toast({ title: 'Productos unidos', description: `"${origen.nombre}" ahora es parte de "${actualizado.nombre}".` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudieron unir', description: e.message });
    }
  };

  const borrarMov = async () => {
    const m = aBorrar;
    setABorrar(null);
    const conGrupo = m.tipo === 'traslado' && m.grupo;
    const { error: err } = conGrupo
      ? await supabase.from('stock_movimientos').delete().eq('grupo', m.grupo)
      : await supabase.from('stock_movimientos').delete().eq('id', m.id);
    if (err) return toast({ variant: 'destructive', title: 'No se pudo borrar', description: err.message });
    setMovimientos((prev) => prev.filter((x) => (conGrupo ? x.grupo !== m.grupo : x.id !== m.id)));
    toast({ title: 'Movimiento borrado' });
  };

  const mesActual = hoyISO().slice(0, 7);
  const cierreActual = cierres.find((c) => c.mes === mesActual);
  const hacerCierre = async () => {
    setCerrarMes(false);
    const items = itemsCierre(resumen);
    const v = valorCierre(items);
    const fila = { mes: mesActual, fecha: hoyISO(), items, valor_dentro: Math.round(v.dentro * 100) / 100, valor_afuera: Math.round(v.afuera * 100) / 100, origen: 'sistema' };
    const { data, error: err } = cierreActual
      ? await supabase.from('stock_cierres').update(fila).eq('id', cierreActual.id).select().single()
      : await supabase.from('stock_cierres').insert(fila).select().single();
    if (err) return toast({ variant: 'destructive', title: 'No se pudo cerrar el mes', description: err.message });
    setCierres((prev) => [...prev.filter((c) => c.mes !== mesActual), data].sort((a, b) => a.mes.localeCompare(b.mes)));
    toast({ title: `Cierre de ${nombreMes(mesActual)} guardado`, description: `${items.length} productos · ${formatoMonto(v.dentro + v.afuera)}` });
  };

  const importar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportando({ pct: 0, texto: 'Leyendo la planilla…' });
    try {
      const r = await importarPlanillaStock(file, (pct, texto) => setImportando({ pct, texto }));
      await recargar();
      toast({
        title: 'Planilla importada',
        description: `${r.productosNuevos} productos nuevos, ${r.mesesNuevos} meses de histórico.${r.inicial ? ` Stock actual: ${r.inicial} filas (lo del depósito queda en "Sin ubicar").` : r.saltoInicial ? ' El stock actual no se tocó porque ya hay conteos cargados.' : ''}`,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo importar', description: err.message });
    } finally {
      setImportando(null);
    }
  };

  const abrirMover = (producto, ubic) => setMoverForm({ inicial: { producto_id: producto?.id || '', origen_id: ubic?.id || '' } });
  const abrirMov = (tipo, producto) => setMovForm({ inicial: { tipo, producto_id: producto?.id || '', costo: producto?.costo ?? '' } });

  const ubicRelevando = relevando && ubicaciones.find((u) => u.id === relevando);
  const detalle = detalleId && porProducto.get(detalleId);
  const maxCierre = Math.max(1, ...cierres.map((c) => (c.valor_dentro || 0) + (c.valor_afuera || 0)));
  const sinUbicar = lugares.find((u) => u.tipo === 'sin_ubicar');

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Stock</h1>
          <p className="text-sm text-slate-500">Depósito propio por sala y góndola, y mercadería en depósitos de proveedores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importar} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!importando}><Upload className="mr-2 h-4 w-4" /> Importar planilla</Button>
          <Button variant="outline" onClick={() => abrirMover(null, null)}><ArrowRightLeft className="mr-2 h-4 w-4" /> Mover</Button>
          <Button variant="outline" onClick={() => abrirMov('entrada')}><LogIn className="mr-2 h-4 w-4" /> Entrada / salida</Button>
          <Button onClick={() => setProductoForm({ inicial: null })}><Plus className="mr-2 h-4 w-4" /> Producto</Button>
        </div>
      </div>

      {importando && (
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <p className="text-sm font-medium">{importando.texto}</p>
          <Progress value={importando.pct} />
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">No se pudo cargar el stock: {error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta icon={Warehouse} titulo="Valor en el depósito" valor={formatoMonto(totales.valorDentro)} detalle={`${totales.conStock} productos con stock`} />
        <Tarjeta icon={Truck} titulo="Valor afuera" valor={formatoMonto(totales.valorAfuera)} detalle="En depósitos de proveedores" />
        <Tarjeta icon={AlertTriangle} titulo="Bajo el mínimo" valor={totales.bajoMinimo} detalle="Productos para reponer" tono={totales.bajoMinimo ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'} onClick={() => { setTab('stock'); setVista('minimo'); }} />
        <Tarjeta icon={CalendarCheck} titulo="Último cierre" valor={cierres.length ? <span className="capitalize">{nombreMes(cierres[cierres.length - 1].mes)}</span> : '—'} detalle={cierreActual ? 'Este mes ya está cerrado' : 'Este mes todavía no se cerró'} onClick={() => setTab('historico')} />
      </div>

      <div className="flex flex-wrap gap-2 border-b">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setRelevando(null); }} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-ink'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>
      ) : tab === 'stock' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="relative block flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setVisibles(PAGINA); }} placeholder="Buscar producto…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand" />
            </label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectClase}>
              <option value="todas">Todas las categorías</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={vista} onChange={(e) => setVista(e.target.value)} className={selectClase}>
              <option value="con">Con stock</option>
              <option value="minimo">Bajo el mínimo</option>
              <option value="todos">Todos los productos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
          {!productos.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">
              Todavía no hay productos. Descargá la planilla de stock como Excel y tocá <b>Importar planilla</b>, o creá los productos a mano.
            </p>
          )}
          {!!productos.length && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Depósito</th>
                    <th className="px-3 py-2 text-right">Afuera</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Mínimo</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {!filas.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay productos con ese filtro.</td></tr>}
                  {filas.slice(0, visibles).map((r) => (
                    <tr key={r.producto.id} onClick={() => setDetalleId(r.producto.id)} className="border-t border-slate-100 cursor-pointer hover:bg-orange-50">
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.producto.nombre}</span>
                        <span className="block text-xs text-slate-500">
                          {r.producto.categoria}
                          {r.lugares.length ? ` · ${r.lugares.slice(0, 2).map((l) => l.ubicacion.nombre).join(', ')}${r.lugares.length > 2 ? '…' : ''}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.dentro ? formatoCantidad(r.dentro) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-sky-700">{r.afuera ? formatoCantidad(r.afuera) : ''}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.bajoMinimo ? 'text-red-600' : ''}`}>{formatoCantidad(r.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.producto.stock_minimo != null ? formatoCantidad(r.producto.stock_minimo) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-500">{r.producto.costo ? formatoMonto(r.producto.costo) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.valor ? formatoMonto(r.valor) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filas.length > visibles && <Button variant="outline" onClick={() => setVisibles((v) => v + PAGINA)}>Ver más ({filas.length - visibles})</Button>}
        </section>
      ) : tab === 'deposito' ? (
        ubicRelevando ? (
          <Relevamiento
            ubicacion={ubicRelevando}
            ubicaciones={ubicaciones}
            productos={productos}
            movimientos={movimientos}
            onVolver={() => setRelevando(null)}
            onGuardado={sumarMovs}
            onProductoCreado={ponerProducto}
            onMover={abrirMover}
          />
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">Tocá una sala o góndola para contar lo que hay. Arranca con lo del último conteo; corregí lo que cambió y guardá.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setUbicForm({ inicial: { tipo: 'sala' } })}><Plus className="mr-1 h-4 w-4" /> Sala</Button>
                <Button variant="outline" onClick={() => setUbicForm({ inicial: { tipo: 'gondola' } })}><Plus className="mr-1 h-4 w-4" /> Góndola</Button>
                <Button variant="outline" onClick={() => setUbicForm({ inicial: { tipo: 'proveedor' } })}><Plus className="mr-1 h-4 w-4" /> Depósito de proveedor</Button>
              </div>
            </div>

            {!lugares.some((u) => u.tipo === 'sala' || u.tipo === 'gondola') && (
              <p className="rounded-xl border border-dashed p-6 text-center text-slate-500">Creá tus salas (y las góndolas de cada sala) para empezar a contar el depósito por partes.</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lugares.filter((u) => u.tipo === 'sala' || (u.tipo === 'gondola' && u.nivel === 0)).map((sala) => {
                const gondolas = lugares.filter((g) => g.tipo === 'gondola' && g.padre_id === sala.id);
                return (
                  <div key={sala.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <LugarFila lugar={sala} titulo={sala.nombre} subtitulo={gondolas.length ? 'Piso de la sala (fuera de góndolas)' : sala.tipo === 'gondola' ? 'Góndola' : 'Sala sin góndolas'} grande onAbrir={() => setRelevando(sala.id)} onEditar={() => setUbicForm({ inicial: sala })} />
                    {gondolas.map((g) => (
                      <LugarFila key={g.id} lugar={g} titulo={g.nombre} subtitulo="Góndola" onAbrir={() => setRelevando(g.id)} onEditar={() => setUbicForm({ inicial: g })} />
                    ))}
                    {sala.tipo === 'sala' && <button type="button" className="text-sm font-semibold text-brand" onClick={() => setUbicForm({ inicial: { tipo: 'gondola', padre_id: sala.id } })}>+ Góndola en {sala.nombre}</button>}
                  </div>
                );
              })}
            </div>

            {lugares.some((u) => u.tipo === 'proveedor') && (
              <div className="space-y-2">
                <h3 className="font-semibold text-ink flex items-center gap-2"><Truck className="h-4 w-4" /> Afuera, en depósitos de proveedores</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {lugares.filter((u) => u.tipo === 'proveedor').map((u) => (
                    <div key={u.id} className="rounded-xl border bg-white p-3">
                      <LugarFila lugar={u} titulo={u.nombre} subtitulo="Depósito de proveedor" onAbrir={() => setRelevando(u.id)} onEditar={() => setUbicForm({ inicial: u })} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sinUbicar && sinUbicar.productos > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                <LugarFila lugar={sinUbicar} titulo="Sin ubicar" subtitulo="Stock del último mes de la planilla que todavía no se contó en una sala o góndola" onAbrir={() => setRelevando(sinUbicar.id)} />
                <p className="text-xs text-amber-800">Cuando contás un producto en una góndola o sala, deja de estar acá. También podés moverlo con <b>Mover</b>.</p>
              </div>
            )}
          </section>
        )
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Foto del stock al final de cada mes. Al terminar de contar, cerrá el mes para que quede en el histórico.</p>
            <Button onClick={() => setCerrarMes(true)}><CalendarCheck className="mr-2 h-4 w-4" /> Cerrar {nombreMes(mesActual)}</Button>
          </div>
          {!cierres.length && <p className="rounded-xl border border-dashed p-6 text-center text-slate-500">Todavía no hay cierres. Importá la planilla para traer el histórico desde abril.</p>}
          {!!cierres.length && (
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Mes</th>
                    <th className="px-3 py-2 text-right">Productos</th>
                    <th className="px-3 py-2 text-right">Depósito</th>
                    <th className="px-3 py-2 text-right">Afuera</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 w-1/4" />
                  </tr>
                </thead>
                <tbody>
                  {[...cierres].reverse().map((c) => {
                    const total = (c.valor_dentro || 0) + (c.valor_afuera || 0);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="capitalize font-medium">{nombreMes(c.mes)}</span>
                          <span className="block text-xs text-slate-500">{c.origen === 'planilla' ? 'Planilla' : `Cerrado el ${fechaCorta(c.fecha)}`}{c.nota ? ` · ${c.nota}` : ''}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{(c.items || []).length}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatoMonto(c.valor_dentro || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-sky-700">{formatoMonto(c.valor_afuera || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold">{formatoMonto(total)}</td>
                        <td className="px-3 py-2">
                          <div className="flex h-3 rounded bg-slate-100 overflow-hidden">
                            <div className="bg-brand" style={{ width: `${((c.valor_dentro || 0) / maxCierre) * 100}%` }} />
                            <div className="bg-sky-400" style={{ width: `${((c.valor_afuera || 0) / maxCierre) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Valor = cantidad × costo de compra. Para ver la evolución de un producto, abrilo desde Stock actual.</p>
        </section>
      )}

      <ProductoDialog
        fila={detalle}
        ubicaciones={ubicaciones}
        movimientos={movimientos}
        cierres={cierres}
        onClose={() => setDetalleId(null)}
        onEditar={(p) => setProductoForm({ inicial: p })}
        onMover={abrirMover}
        onMovimiento={abrirMov}
        onBorrarMov={setABorrar}
      />
      <ProductoForm open={!!productoForm} inicial={productoForm?.inicial} onClose={() => setProductoForm(null)} onSave={guardarProd} onUnir={setUnir} />
      <UnirDialog origen={unir} productos={productos} onClose={() => setUnir(null)} onUnir={hacerUnion} />
      <UbicacionForm
        open={!!ubicForm}
        inicial={ubicForm?.inicial}
        ubicaciones={ubicaciones}
        proveedores={proveedores}
        onClose={() => setUbicForm(null)}
        onSave={guardarUbic}
        onArchivar={ubicForm?.inicial?.id && ubicForm.inicial.tipo !== 'sin_ubicar' ? () => archivarUbic(lugares.find((l) => l.id === ubicForm.inicial.id) || ubicForm.inicial) : null}
      />
      <MovimientoForm open={!!movForm} inicial={movForm?.inicial} productos={productos} ubicaciones={ubicaciones} onClose={() => setMovForm(null)} onSave={guardarMov} />
      <MoverForm open={!!moverForm} inicial={moverForm?.inicial} productos={productos} ubicaciones={ubicaciones} movimientos={movimientos} onClose={() => setMoverForm(null)} onSave={guardarMover} />

      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aBorrar?.tipo === 'traslado' ? 'Se borra el traslado completo (la salida y la entrada).' : 'El stock se recalcula sin este movimiento.'} No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={borrarMov} className="bg-red-600 hover:bg-red-700">Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cerrarMes} onOpenChange={setCerrarMes}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar {nombreMes(mesActual)}</AlertDialogTitle>
            <AlertDialogDescription>
              Se guarda la foto del stock de hoy ({totales.conStock} productos, {formatoMonto(totales.valorDentro + totales.valorAfuera)}) como cierre del mes.
              {cierreActual ? ' Este mes ya tenía un cierre: se reemplaza.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={hacerCierre}>Cerrar el mes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

/** Una sala, góndola o depósito en la lista: cuántos productos tiene y cuándo se contó. */
const LugarFila = ({ lugar, titulo, subtitulo, grande, onAbrir, onEditar }) => (
  <div className="flex items-center gap-2">
    <button type="button" onClick={onAbrir} className={`flex-1 flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-orange-50 ${grande ? '' : 'ml-4 border-l-2 border-slate-200'}`}>
      <ClipboardList className="h-5 w-5 shrink-0 text-brand" />
      <span className="flex-1">
        <b className={grande ? 'text-base' : 'text-sm'}>{titulo}</b>
        <span className="block text-xs text-slate-500">{subtitulo}</span>
      </span>
      <span className="text-right text-xs text-slate-500 whitespace-nowrap">
        <b className="block text-sm text-ink">{lugar.productos} productos</b>
        {lugar.ultimoConteo ? `Contado el ${fechaCorta(lugar.ultimoConteo)}` : 'Sin contar'}
      </span>
    </button>
    {onEditar && <button type="button" onClick={onEditar} className="p-2 text-slate-400 hover:text-brand" title="Editar"><Pencil className="h-4 w-4" /></button>}
  </div>
);

export default StockView;
