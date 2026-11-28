import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Upload, Search, Pencil, Trash2, Landmark, BookOpen, BarChart3, Wallet, CheckCircle2, ShoppingCart } from 'lucide-react';
import { fechaCorta, formatoMonto, hoyISO, textoTotales } from '@/lib/pagos';
import {
  EMISORES, TRAMOS, NOMBRE_MES, claveCliente, cuentaCorriente, diasEntre, facturasPendientes,
  resumenMensual, resumenPendientes, porMoneda, CUENTAS, ventasSvcPendientes,
} from '@/lib/cobros';
import VentasSvc from '@/components/cobros/VentasSvc';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCobros, asegurarCliente } from '@/components/cobros/useCobros';
import { importarPlanillaCobros } from '@/components/cobros/importarCobros';
import { FacturaForm, CobroForm, ClienteCobroForm, MarcarCobradaDialog } from '@/components/cobros/FormulariosCobros';
import EstadoCuentaDialog from '@/components/cobros/EstadoCuentaDialog';
import PorCobrar from '@/components/cobros/PorCobrar';

const PAGINA = 60;

const TABS = [
  { id: 'estado', label: 'Estado', icon: Landmark },
  { id: 'cuentas', label: 'Cuentas corrientes', icon: BookOpen },
  { id: 'svc', label: 'Ventas SVC', icon: ShoppingCart },
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
];

const selectClase = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand';
const limpiar = (v) => (typeof v === 'string' ? v.trim() || null : v);
const coincide = (q, ...campos) => !q || campos.join(' ').toLowerCase().includes(q);

const Buscador = ({ value, onChange, placeholder }) => (
  <label className="relative block flex-1 min-w-[200px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand"
    />
  </label>
);

const EmisorChip = ({ emisor }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${emisor === 'nicolas' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
    {emisor === 'nicolas' ? 'N. Ambrosi' : 'Comprasuy'}
  </span>
);

const colorDias = (d) => (d > 90 ? 'bg-red-100 text-red-800' : d > 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700');

const CobrosView = () => {
  const { toast } = useToast();
  const { clientes, facturas, cobros, ventasSvc, setClientes, setFacturas, setCobros, setVentasSvc, loading, error, recargar } = useCobros();
  const { user } = useAuth();
  const [busquedaSvc, setBusquedaSvc] = useState('');
  const [tab, setTab] = useState('estado');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState({ emisor: 'todos', estado: 'pendientes', anio: 'todos' });
  const [visibles, setVisibles] = useState(PAGINA);
  const [form, setForm] = useState(null); // { tipo: 'factura'|'cobro'|'cliente', inicial }
  const [marcar, setMarcar] = useState(null);
  const [cuentaId, setCuentaId] = useState(null);
  const [aBorrar, setABorrar] = useState(null); // { tipo, fila }
  const [importando, setImportando] = useState(null);
  const fileRef = useRef(null);
  const query = q.trim().toLowerCase();

  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const esCuenta = (x) => porId.get(x.cliente_id)?.modalidad === 'cuenta';

  // Lo que falta cobrar: facturas, cuentas corrientes y ventas de SVC pendientes de pago.
  const pendientes = useMemo(() => [...facturasPendientes(clientes, facturas, cobros), ...ventasSvcPendientes(ventasSvc)], [clientes, facturas, cobros, ventasSvc]);
  const resumen = useMemo(() => resumenPendientes(pendientes), [pendientes]);

  // ---------- Estado ----------
  const anios = useMemo(() => [...new Set(facturas.map((f) => String(f.fecha || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [facturas]);
  const facturasEstado = useMemo(() => {
    const lista = facturas.filter((f) =>
      !esCuenta(f) &&
      (filtro.emisor === 'todos' || f.emisor === filtro.emisor) &&
      (filtro.anio === 'todos' || String(f.fecha || '').startsWith(filtro.anio)) &&
      (filtro.estado === 'todas' || (filtro.estado === 'cobradas' ? f.cobrada : !f.cobrada && (filtro.estado !== 'vencidas' || diasEntre(f.fecha) > 90))) &&
      coincide(query, f.cliente, f.numero, f.oc, f.importe, f.detalle));
    // Pendientes: la más vieja primero. El resto: la más nueva primero.
    return filtro.estado === 'pendientes' || filtro.estado === 'vencidas'
      ? lista.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
      : lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturas, porId, filtro, query]);

  // ---------- Cuentas corrientes ----------
  const cuentas = useMemo(() => clientes
    .filter((c) => c.modalidad === 'cuenta' && coincide(query, c.nombre, c.notas, c.rut))
    .map((c) => ({ cliente: c, cuenta: cuentaCorriente(facturas.filter((f) => f.cliente_id === c.id), cobros.filter((x) => x.cliente_id === c.id)) }))
    .sort((a, b) => (b.cuenta.saldos.UYU || 0) - (a.cuenta.saldos.UYU || 0)), [clientes, facturas, cobros, query]);

  const cuentaAbierta = cuentaId ? porId.get(cuentaId) : null;

  // ---------- Guardar ----------
  const sumarCliente = (cli) => setClientes((prev) => (prev.some((c) => c.id === cli.id) ? prev : [...prev, cli].sort((a, b) => a.nombre.localeCompare(b.nombre))));

  const guardarFactura = async (v) => {
    try {
      const cli = await asegurarCliente(v.cliente, { modalidad: v.modalidad, tipo: v.modalidad === 'cuenta' ? 'privado' : 'estado' });
      sumarCliente(cli);
      const porFactura = cli.modalidad !== 'cuenta';
      const fila = {
        emisor: v.emisor, cliente_id: cli.id, cliente: cli.nombre, numero: limpiar(v.numero), fecha: v.fecha || null, oc: limpiar(v.oc),
        moneda: v.moneda, importe: v.importe, detalle: limpiar(v.detalle),
        cobrada: porFactura && !!v.cobrada, fecha_cobro: porFactura && v.cobrada ? v.fecha_cobro || null : null,
      };
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('facturas').insert(fila).select().single()
        : await supabase.from('facturas').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      setFacturas((prev) => (nuevo ? [data, ...prev] : prev.map((f) => (f.id === data.id ? data : f))));
      setForm(null);
      toast({ title: nuevo ? 'Factura guardada' : 'Cambios guardados' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar la factura', description: e.message });
    }
  };

  const guardarCobro = async (v) => {
    try {
      const cli = await asegurarCliente(v.cliente, { modalidad: 'cuenta', tipo: 'privado' });
      sumarCliente(cli);
      const fila = { emisor: v.emisor, cliente_id: cli.id, cliente: cli.nombre, fecha: v.fecha || null, moneda: v.moneda, importe: v.importe, medio: limpiar(v.medio), detalle: limpiar(v.detalle) };
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('cobros').insert(fila).select().single()
        : await supabase.from('cobros').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      setCobros((prev) => (nuevo ? [data, ...prev] : prev.map((c) => (c.id === data.id ? data : c))));
      setForm(null);
      toast({ title: nuevo ? 'Pago registrado' : 'Cambios guardados' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el pago', description: e.message });
    }
  };

  const guardarCliente = async (v) => {
    try {
      const fila = { clave: claveCliente(v.nombre), nombre: v.nombre.trim(), tipo: v.tipo, modalidad: v.modalidad, rut: limpiar(v.rut), whatsapp: limpiar(v.whatsapp), notas: limpiar(v.notas) };
      if (!fila.clave) throw new Error('Falta el nombre.');
      const otro = clientes.find((c) => c.clave === fila.clave && c.id !== form.inicial?.id);
      if (otro) throw new Error(`Ya existe un cliente "${otro.nombre}".`);
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('cobro_clientes').insert(fila).select().single()
        : await supabase.from('cobro_clientes').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      if (!nuevo && data.nombre !== form.inicial.nombre) {
        await supabase.from('facturas').update({ cliente: data.nombre }).eq('cliente_id', data.id);
        await supabase.from('cobros').update({ cliente: data.nombre }).eq('cliente_id', data.id);
        setFacturas((prev) => prev.map((f) => (f.cliente_id === data.id ? { ...f, cliente: data.nombre } : f)));
        setCobros((prev) => prev.map((c) => (c.cliente_id === data.id ? { ...c, cliente: data.nombre } : c)));
      }
      setClientes((prev) => (nuevo ? [...prev, data] : prev.map((c) => (c.id === data.id ? data : c))).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm(null);
      toast({ title: nuevo ? 'Cliente guardado' : 'Cambios guardados' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el cliente', description: e.message });
    }
  };

  const guardarCobrada = async (f, cambios) => {
    const { error: err } = await supabase.from('facturas').update(cambios).eq('id', f.id);
    if (err) {
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: err.message });
      return;
    }
    setFacturas((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...cambios } : x)));
    setMarcar(null);
    toast({ title: cambios.cobrada ? 'Factura marcada como cobrada' : 'Factura pendiente otra vez' });
  };

  const borrar = async () => {
    const { tipo, fila } = aBorrar;
    const tabla = tipo === 'factura' ? 'facturas' : 'cobros';
    const { error: err } = await supabase.from(tabla).delete().eq('id', fila.id);
    setABorrar(null);
    if (err) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: err.message });
      return;
    }
    (tipo === 'factura' ? setFacturas : setCobros)((prev) => prev.filter((x) => x.id !== fila.id));
    toast({ title: tipo === 'factura' ? 'Factura eliminada' : 'Pago eliminado' });
  };

  const importar = async (file) => {
    if (!file) return;
    setImportando({ pct: 0, texto: 'Leyendo planilla…' });
    try {
      const r = await importarPlanillaCobros(file, (pct, texto) => setImportando({ pct, texto }));
      toast({
        title: 'Planilla importada',
        description: `${r.nuevos.facturas} facturas, ${r.nuevos.cobros} pagos y ${r.nuevos.clientes} clientes nuevos (de ${r.leidos.facturas} facturas y ${r.leidos.cobros} pagos leídos). Revisá los saldos en Cuentas corrientes.`,
      });
      await recargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo importar', description: e.message });
    } finally {
      setImportando(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const irA = (destino) => {
    if (destino === 'svc') { setBusquedaSvc(''); setTab('svc'); return; }
    setTab('estado');
    setVisibles(PAGINA);
    if (destino === 'vencidas') setFiltro((f) => ({ ...f, emisor: 'todos', estado: 'vencidas', anio: 'todos' }));
    else setFiltro((f) => ({ ...f, emisor: destino, estado: 'pendientes', anio: 'todos' }));
  };

  const editarFila = (tipo, fila) => {
    const cli = porId.get(fila.cliente_id);
    setForm({ tipo, inicial: { ...fila, cliente: cli?.nombre || fila.cliente } });
  };

  // ---------- Resumen ----------
  const mensual = useMemo(() => resumenMensual(facturas, cobros, 12, hoyISO(), ventasSvc), [facturas, cobros, ventasSvc]);
  const deudores = useMemo(() => {
    const m = new Map();
    for (const p of pendientes) {
      const k = p.cliente_id || p.cliente;
      const d = m.get(k) || { cliente: porId.get(p.cliente_id)?.nombre || p.cliente, id: p.cliente_id, filas: [], dias: 0 };
      d.filas.push(p);
      d.dias = Math.max(d.dias, p.dias || 0);
      m.set(k, d);
    }
    return [...m.values()].map((d) => ({ ...d, total: porMoneda(d.filas, 'pendiente') })).sort((a, b) => (b.total.UYU || 0) - (a.total.UYU || 0)).slice(0, 12);
  }, [pendientes, porId]);

  const totalLista = porMoneda(facturasEstado);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-ink">Cobros</h1>
          <p className="text-slate-500">Facturas al Estado y cuentas corrientes de clientes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!importando}>
            <Upload className="mr-2 h-4 w-4" /> Importar planilla
          </Button>
          <Button onClick={() => setForm({ tipo: 'factura', inicial: null })}><Plus className="mr-2 h-4 w-4" /> Nueva factura</Button>
          <Button onClick={() => setForm({ tipo: 'cobro', inicial: null })}><Wallet className="mr-2 h-4 w-4" /> Registrar pago</Button>
        </div>
      </div>

      {importando && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-800">{importando.texto}</p>
          <Progress value={importando.pct} className="mt-2" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-brand" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">No se pudieron cargar los cobros: {error}</div>
      ) : (
        <>
          <PorCobrar resumen={resumen} pendientes={pendientes} onIr={irA} />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex gap-1 border-b border-slate-200 px-3 pt-3 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); setQ(''); setVisibles(PAGINA); }}
                  className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-ink'}`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {tab === 'estado' && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Buscador value={q} onChange={(v) => { setQ(v); setVisibles(PAGINA); }} placeholder="Buscar organismo, factura, OC, importe…" />
                    <select value={filtro.emisor} onChange={(e) => setFiltro((f) => ({ ...f, emisor: e.target.value }))} className={selectClase} aria-label="Cuenta">
                      <option value="todos">Las dos cuentas</option>
                      {Object.entries(EMISORES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                    </select>
                    <select value={filtro.estado} onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value }))} className={selectClase} aria-label="Estado">
                      <option value="pendientes">Pendientes</option>
                      <option value="vencidas">Pendientes hace más de 90 días</option>
                      <option value="cobradas">Cobradas</option>
                      <option value="todas">Todas</option>
                    </select>
                    <select value={filtro.anio} onChange={(e) => setFiltro((f) => ({ ...f, anio: e.target.value }))} className={selectClase} aria-label="Año">
                      <option value="todos">Todos los años</option>
                      {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <p className="text-sm text-slate-500">
                    {facturasEstado.length} {facturasEstado.length === 1 ? 'factura' : 'facturas'} · Total: <b className="text-ink">{textoTotales(totalLista)}</b>
                  </p>
                  {facturasEstado.length === 0 ? (
                    <p className="text-center text-slate-500 py-10">{facturas.length ? 'No hay facturas con ese filtro.' : 'Todavía no hay facturas. Importá la planilla o cargá una nueva.'}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Cuenta</th>
                            <th className="px-3 py-2">Organismo</th>
                            <th className="px-3 py-2">Factura</th>
                            <th className="px-3 py-2">OC</th>
                            <th className="px-3 py-2 text-right">Importe</th>
                            <th className="px-3 py-2">Cobro</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {facturasEstado.slice(0, visibles).map((f) => {
                            const dias = diasEntre(f.fecha);
                            return (
                              <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2 whitespace-nowrap">{fechaCorta(f.fecha)}</td>
                                <td className="px-3 py-2"><EmisorChip emisor={f.emisor} /></td>
                                <td className="px-3 py-2">
                                  <button type="button" className="font-semibold text-left hover:text-brand" title="Editar organismo" onClick={() => { const c = porId.get(f.cliente_id); if (c) setForm({ tipo: 'cliente', inicial: c }); }}>
                                    {f.cliente}
                                  </button>
                                  {f.detalle && <span className="block text-xs text-slate-500">{f.detalle}</span>}
                                </td>
                                <td className="px-3 py-2">{f.numero || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{f.oc || '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{formatoMonto(f.importe, f.moneda)}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {f.cobrada ? (
                                    <button type="button" onClick={() => setMarcar(f)} className="inline-flex items-center gap-1 text-green-700 font-semibold hover:underline">
                                      <CheckCircle2 className="h-4 w-4" /> {f.fecha_cobro ? fechaCorta(f.fecha_cobro) : 'Cobrada'}
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-2">
                                      {dias !== null && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorDias(dias)}`}>{dias} días</span>}
                                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setMarcar(f)}>Marcar cobrada</Button>
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                  <button type="button" onClick={() => editarFila('factura', f)} className="p-1 text-slate-400 hover:text-brand" title="Editar"><Pencil className="h-4 w-4" /></button>
                                  <button type="button" onClick={() => setABorrar({ tipo: 'factura', fila: f })} className="p-1 text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {facturasEstado.length > visibles && (
                    <div className="text-center py-3"><Button variant="outline" onClick={() => setVisibles((v) => v + PAGINA)}>Mostrar más ({facturasEstado.length - visibles} restantes)</Button></div>
                  )}
                </>
              )}

              {tab === 'cuentas' && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Buscador value={q} onChange={setQ} placeholder="Buscar cliente…" />
                    <Button variant="outline" onClick={() => setForm({ tipo: 'cliente', inicial: { nombre: '', tipo: 'privado', modalidad: 'cuenta' } })}><Plus className="mr-2 h-4 w-4" /> Nuevo cliente</Button>
                  </div>
                  <p className="text-sm text-slate-500">
                    {cuentas.length} {cuentas.length === 1 ? 'cliente' : 'clientes'} · Saldo total: <b className="text-ink">{textoTotales(cuentas.reduce((acc, { cuenta }) => {
                      for (const [m, v] of Object.entries(cuenta.saldos)) if (v > 0) acc[m] = (acc[m] || 0) + v;
                      return acc;
                    }, {}))}</b>
                  </p>
                  {cuentas.length === 0 ? (
                    <p className="text-center text-slate-500 py-10">No hay clientes con cuenta corriente.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {cuentas.map(({ cliente, cuenta }) => {
                        const saldo = cuenta.saldos.UYU || 0;
                        const otros = Object.entries(cuenta.saldos).filter(([m, v]) => m !== 'UYU' && Math.abs(v) > 0.5);
                        const vieja = cuenta.pendientes[0];
                        return (
                          <button
                            key={cliente.id}
                            type="button"
                            onClick={() => setCuentaId(cliente.id)}
                            className={`text-left rounded-xl border p-4 hover:border-brand transition-colors ${saldo > 0.5 ? 'bg-white border-slate-200' : 'bg-green-50 border-green-200'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-ink">{cliente.nombre}</span>
                              {saldo <= 0.5 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">{saldo < -0.5 ? 'a favor' : 'al día'}</span>}
                            </div>
                            {cliente.notas && <span className="block text-xs text-slate-500 truncate">{cliente.notas}</span>}
                            <b className="block text-xl mt-2 tabular-nums">{formatoMonto(Math.abs(saldo), 'UYU')}</b>
                            {otros.map(([m, v]) => <b key={m} className="block tabular-nums">{formatoMonto(v, m)}</b>)}
                            <span className="block text-xs text-slate-500 mt-1">
                              {cuenta.pendientes.length ? `${cuenta.pendientes.length} ${cuenta.pendientes.length === 1 ? 'factura pendiente' : 'facturas pendientes'}${vieja?.fecha ? `, la más vieja del ${fechaCorta(vieja.fecha)}` : ''}` : 'Sin facturas pendientes'}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {cuenta.ultimoCobro ? `Último pago: ${fechaCorta(cuenta.ultimoCobro.fecha)} · ${formatoMonto(cuenta.ultimoCobro.importe, cuenta.ultimoCobro.moneda)}` : 'Sin pagos registrados'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === 'svc' && (
                <VentasSvc key={busquedaSvc} ventas={ventasSvc} setVentas={setVentasSvc} esAdmin={user?.role === 'admin'} busquedaInicial={busquedaSvc} />
              )}

              {tab === 'resumen' && (
                <div className="space-y-6">
                  <section>
                    <h2 className="font-bold text-ink mb-2">Antigüedad de lo pendiente</h2>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Cuenta</th>
                            {TRAMOS.map((t) => <th key={t.id} className="px-3 py-2 text-right">{t.label}</th>)}
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(CUENTAS).map(([id, nombre]) => (
                            <tr key={id} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-semibold">{nombre}</td>
                              {TRAMOS.map((t) => (
                                <td key={t.id} className={`px-3 py-2 text-right tabular-nums ${t.id === 'mas' && resumen.porTramo[id]?.mas ? 'text-red-700 font-semibold' : ''}`}>
                                  {resumen.porTramo[id]?.[t.id] ? textoTotales(resumen.porTramo[id][t.id]) : '—'}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right tabular-nums font-bold">{textoTotales(resumen.porEmisor[id] || {})}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h2 className="font-bold text-ink mb-2">Clientes que más deben</h2>
                    {deudores.length === 0 ? <p className="text-slate-500">No hay nada pendiente.</p> : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Cliente</th>
                              <th className="px-3 py-2 text-right">Facturas</th>
                              <th className="px-3 py-2 text-right">Pendiente</th>
                              <th className="px-3 py-2 text-right">La más vieja</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deudores.map((d) => (
                              <tr key={d.id || d.cliente} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">
                                  {porId.get(d.id)?.modalidad === 'cuenta'
                                    ? <button type="button" className="hover:text-brand" onClick={() => setCuentaId(d.id)}>{d.cliente}</button>
                                    : d.filas.every((f) => f.origen === 'svc')
                                    ? <button type="button" className="hover:text-brand" onClick={() => { setBusquedaSvc(d.cliente); setTab('svc'); }}>{d.cliente}</button>
                                    : <button type="button" className="hover:text-brand" onClick={() => { setTab('estado'); setQ(d.cliente); setFiltro((f) => ({ ...f, emisor: 'todos', estado: 'pendientes', anio: 'todos' })); }}>{d.cliente}</button>}
                                </td>
                                <td className="px-3 py-2 text-right">{d.filas.length}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">{textoTotales(d.total)}</td>
                                <td className="px-3 py-2 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorDias(d.dias)}`}>{d.dias} días</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h2 className="font-bold text-ink mb-2">Facturado y cobrado por mes <span className="text-sm font-normal text-slate-500">(en pesos)</span></h2>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left" rowSpan={2}>Mes</th>
                            {Object.values(CUENTAS).map((n) => <th key={n} className="px-3 pt-2 text-center" colSpan={2}>{n}</th>)}
                          </tr>
                          <tr>
                            {Object.keys(CUENTAS).map((id) => (
                              <React.Fragment key={id}>
                                <th className="px-3 pb-2 text-right font-medium">Facturado</th>
                                <th className="px-3 pb-2 text-right font-medium">Cobrado</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mensual.slice().reverse().map((m) => (
                            <tr key={m.mes} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-semibold">{NOMBRE_MES(m.mes)}</td>
                              {Object.keys(CUENTAS).map((id) => (
                                <React.Fragment key={id}>
                                  <td className="px-3 py-2 text-right tabular-nums">{m.facturado[id] ? formatoMonto(m.facturado[id]) : '—'}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-green-700">{m.cobrado[id] ? formatoMonto(m.cobrado[id]) : '—'}</td>
                                </React.Fragment>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <FacturaForm open={form?.tipo === 'factura'} inicial={form?.tipo === 'factura' ? form.inicial : null} clientes={clientes} onClose={() => setForm(null)} onSave={guardarFactura} />
      <CobroForm open={form?.tipo === 'cobro'} inicial={form?.tipo === 'cobro' ? form.inicial : null} clientes={clientes} onClose={() => setForm(null)} onSave={guardarCobro} />
      <ClienteCobroForm open={form?.tipo === 'cliente'} inicial={form?.tipo === 'cliente' ? form.inicial : null} onClose={() => setForm(null)} onSave={guardarCliente} />
      <MarcarCobradaDialog factura={marcar} onClose={() => setMarcar(null)} onSave={guardarCobrada} />

      {cuentaAbierta && !form && !aBorrar && (
        <EstadoCuentaDialog
          cliente={cuentaAbierta}
          facturas={facturas}
          cobros={cobros}
          onClose={() => setCuentaId(null)}
          onNuevaFactura={(c) => setForm({ tipo: 'factura', inicial: { cliente: c.nombre, fecha: hoyISO() } })}
          onNuevoCobro={(c) => setForm({ tipo: 'cobro', inicial: { cliente: c.nombre, fecha: hoyISO() } })}
          onEditar={editarFila}
          onBorrar={(tipo, fila) => setABorrar({ tipo, fila })}
          onEditarCliente={(c) => setForm({ tipo: 'cliente', inicial: c })}
        />
      )}

      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {aBorrar?.tipo === 'factura' ? 'esta factura' : 'este pago'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {aBorrar && `${aBorrar.fila.cliente} · ${aBorrar.tipo === 'factura' ? `Factura ${aBorrar.fila.numero || 's/n'}` : 'Pago'} del ${fechaCorta(aBorrar.fila.fecha)} · ${formatoMonto(aBorrar.fila.importe, aBorrar.fila.moneda)}. No se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={borrar} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default CobrosView;
