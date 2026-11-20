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
import { Loader2, Plus, Upload, Search, MessageCircle, Pencil, Trash2, Landmark, Receipt, Users } from 'lucide-react';
import {
  ESTADOS_CHEQUE, fechaCorta, formatoMonto, hoyISO, sumarDias, textoTotales, totalesPorMoneda,
  normalizarBanco, nombreProveedor,
} from '@/lib/pagos';
import { usePagos, asegurarProveedor } from '@/components/pagos/usePagos';
import AlertasPagos from '@/components/pagos/AlertasPagos';
import WhatsAppDialog from '@/components/pagos/WhatsAppDialog';
import { DepositoForm, ChequeForm, ProveedorForm } from '@/components/pagos/Formularios';
import { importarPlanillaPagos } from '@/components/pagos/importarPlanilla';
import { claveProveedor } from '@/lib/pagos';

const PAGINA = 60;

const TABS = [
  { id: 'depositos', label: 'Depósitos', icon: Landmark },
  { id: 'cheques', label: 'Cheques', icon: Receipt },
  { id: 'proveedores', label: 'Proveedores', icon: Users },
];

const selectClase = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand';

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

const MostrarMas = ({ total, visibles, onMas }) =>
  total > visibles ? (
    <div className="text-center py-3">
      <Button variant="outline" onClick={onMas}>Mostrar más ({total - visibles} restantes)</Button>
    </div>
  ) : null;

const Vacio = ({ texto }) => <p className="text-center text-slate-500 py-10">{texto}</p>;

const coincide = (q, ...campos) => !q || campos.join(' ').toLowerCase().includes(q);

const limpiar = (v) => (typeof v === 'string' ? v.trim() || null : v);

const PagosView = () => {
  const { toast } = useToast();
  const { proveedores, depositos, cheques, config, setConfig, loading, error, recargar, setDepositos, setCheques, setProveedores } = usePagos();
  const [tab, setTab] = useState('depositos');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState({ depositos: 'todos', cheques: 'pendiente' });
  const [visibles, setVisibles] = useState(PAGINA);
  const [form, setForm] = useState(null); // { tipo, inicial }
  const [whatsapp, setWhatsapp] = useState(null); // { deposito, titulo }
  const [aBorrar, setABorrar] = useState(null); // { tipo, fila }
  const [importando, setImportando] = useState(null);
  const fileRef = useRef(null);

  const cambiarTab = (t) => { setTab(t); setQ(''); setVisibles(PAGINA); };
  const query = q.trim().toLowerCase();

  // ---------- Depósitos ----------
  const depositosFiltrados = useMemo(() => depositos.filter((d) =>
    (filtro.depositos === 'todos' || (filtro.depositos === 'pendientes' ? !d.pagado : d.pagado)) &&
    coincide(query, d.proveedor, d.banco, d.numero_cuenta, d.concepto, d.monto)), [depositos, filtro.depositos, query]);

  const guardarDeposito = async (valores) => {
    try {
      const cuenta = { banco: normalizarBanco(valores.banco), tipo_cuenta: limpiar(valores.tipo_cuenta), numero_cuenta: limpiar(valores.numero_cuenta), moneda: valores.moneda };
      const prov = await asegurarProveedor(valores.proveedor, cuenta);
      const fila = {
        fecha: valores.fecha || null,
        proveedor_id: prov?.id || null,
        proveedor: nombreProveedor(valores.proveedor),
        ...cuenta,
        monto: valores.monto,
        concepto: limpiar(valores.concepto),
        pagado: !!valores.pagado,
        fecha_pagado: valores.pagado ? (form.inicial?.fecha_pagado || hoyISO()) : null,
      };
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('depositos').insert(fila).select().single()
        : await supabase.from('depositos').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      setDepositos((prev) => (nuevo ? [data, ...prev] : prev.map((d) => (d.id === data.id ? data : d))));
      if (prov) setProveedores((prev) => (prev.some((p) => p.id === prov.id) ? prev.map((p) => (p.id === prov.id ? prov : p)) : [...prev, prov].sort((a, b) => a.nombre.localeCompare(b.nombre))));
      setForm(null);
      if (nuevo && !data.pagado) setWhatsapp({ deposito: data, titulo: 'Depósito guardado' });
      else toast({ title: nuevo ? 'Depósito guardado' : 'Cambios guardados' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el depósito', description: e.message });
    }
  };

  const togglePagado = async (d) => {
    const cambios = { pagado: !d.pagado, fecha_pagado: d.pagado ? null : hoyISO() };
    setDepositos((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...cambios } : x)));
    const { error: err } = await supabase.from('depositos').update(cambios).eq('id', d.id);
    if (err) {
      setDepositos((prev) => prev.map((x) => (x.id === d.id ? d : x)));
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: err.message });
    }
  };

  // ---------- Cheques ----------
  const chequesFiltrados = useMemo(() => {
    const lista = cheques.filter((c) => (filtro.cheques === 'todos' || c.estado === filtro.cheques) &&
      coincide(query, c.proveedor, c.banco, c.numero, c.concepto, c.monto));
    // Pendientes: el más próximo primero. El resto: el más reciente primero.
    return filtro.cheques === 'pendiente' ? lista : [...lista].reverse();
  }, [cheques, filtro.cheques, query]);

  const guardarCheque = async (valores) => {
    try {
      const prov = await asegurarProveedor(valores.proveedor);
      const fila = {
        proveedor_id: prov?.id || null,
        proveedor: nombreProveedor(valores.proveedor),
        fecha_entrega: valores.fecha_entrega || null,
        fecha_pago: valores.fecha_pago || null,
        banco: normalizarBanco(valores.banco),
        numero: limpiar(valores.numero),
        moneda: valores.moneda,
        monto: valores.monto,
        concepto: limpiar(valores.concepto),
        estado: valores.estado || 'pendiente',
      };
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('cheques').insert(fila).select().single()
        : await supabase.from('cheques').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      setCheques((prev) => {
        const lista = nuevo ? [...prev, data] : prev.map((c) => (c.id === data.id ? data : c));
        return lista.sort((a, b) => String(a.fecha_pago || '9999').localeCompare(String(b.fecha_pago || '9999')));
      });
      if (prov && !proveedores.some((p) => p.id === prov.id)) setProveedores((prev) => [...prev, prov].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm(null);
      toast({ title: nuevo ? 'Cheque guardado' : 'Cambios guardados' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar el cheque', description: e.message });
    }
  };

  const cambiarEstado = async (c, estado) => {
    setCheques((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    const { error: err } = await supabase.from('cheques').update({ estado }).eq('id', c.id);
    if (err) {
      setCheques((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: err.message });
    }
  };

  // ---------- Proveedores ----------
  const resumenProveedor = useMemo(() => {
    const m = new Map();
    for (const d of depositos) if (d.proveedor_id) {
      const r = m.get(d.proveedor_id) || { depositos: 0, cheques: 0, ultimo: '' };
      r.depositos++;
      if ((d.fecha || '') > r.ultimo) r.ultimo = d.fecha;
      m.set(d.proveedor_id, r);
    }
    for (const c of cheques) if (c.proveedor_id) {
      const r = m.get(c.proveedor_id) || { depositos: 0, cheques: 0, ultimo: '' };
      r.cheques++;
      m.set(c.proveedor_id, r);
    }
    return m;
  }, [depositos, cheques]);

  const proveedoresFiltrados = useMemo(() => proveedores.filter((p) => coincide(query, p.nombre, p.rut, p.banco, p.numero_cuenta, p.whatsapp)), [proveedores, query]);

  const guardarProveedor = async (valores) => {
    try {
      const fila = {
        clave: claveProveedor(valores.nombre),
        nombre: nombreProveedor(valores.nombre),
        rut: limpiar(valores.rut),
        whatsapp: limpiar(valores.whatsapp),
        banco: normalizarBanco(valores.banco),
        tipo_cuenta: limpiar(valores.tipo_cuenta),
        numero_cuenta: limpiar(valores.numero_cuenta),
        moneda: valores.moneda || 'UYU',
        notas: limpiar(valores.notas),
      };
      const nuevo = !form.inicial?.id;
      const { data, error: err } = nuevo
        ? await supabase.from('proveedores').insert(fila).select().single()
        : await supabase.from('proveedores').update(fila).eq('id', form.inicial.id).select().single();
      if (err) throw err;
      setProveedores((prev) => (nuevo ? [...prev, data] : prev.map((p) => (p.id === data.id ? data : p))).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm(null);
      toast({ title: 'Proveedor guardado' });
    } catch (e) {
      const dup = /existe|duplicate|23505/i.test(e.message || '');
      toast({ variant: 'destructive', title: 'No se pudo guardar el proveedor', description: dup ? 'Ya hay un proveedor con ese nombre.' : e.message });
    }
  };

  // ---------- Borrar ----------
  const borrar = async () => {
    const { tipo, fila } = aBorrar;
    setABorrar(null);
    const { error: err } = await supabase.from(tipo).delete().eq('id', fila.id);
    if (err) return toast({ variant: 'destructive', title: 'No se pudo eliminar', description: err.message });
    const quitar = (prev) => prev.filter((x) => x.id !== fila.id);
    if (tipo === 'depositos') setDepositos(quitar);
    if (tipo === 'cheques') setCheques(quitar);
    if (tipo === 'proveedores') setProveedores(quitar);
    toast({ title: 'Eliminado' });
  };

  // ---------- Importar ----------
  const importar = async (file) => {
    if (!file) return;
    setImportando({ pct: 0, texto: 'Leyendo planilla…' });
    try {
      const r = await importarPlanillaPagos(file, (pct, texto) => setImportando({ pct, texto }));
      toast({
        title: 'Planilla importada',
        description: `${r.nuevos.depositos} depósitos, ${r.nuevos.cheques} cheques y ${r.nuevos.proveedores} proveedores nuevos (de ${r.leidos.depositos} depósitos y ${r.leidos.cheques} cheques leídos).`,
      });
      await recargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo importar', description: e.message });
    } finally {
      setImportando(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hoy = hoyISO();
  const manana = sumarDias(hoy, 1);

  const lista = tab === 'depositos' ? depositosFiltrados : tab === 'cheques' ? chequesFiltrados : proveedoresFiltrados;
  const totales = tab === 'proveedores' ? null : totalesPorMoneda(lista.filter((x) => tab === 'depositos' || x.estado !== 'anulado'));

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-ink">Pagos</h1>
          <p className="text-slate-500">Depósitos a proveedores y cheques emitidos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!importando}>
            <Upload className="mr-2 h-4 w-4" /> Importar planilla
          </Button>
          <Button onClick={() => setForm({ tipo: 'depositos', inicial: null })}><Plus className="mr-2 h-4 w-4" /> Nuevo depósito</Button>
          <Button onClick={() => setForm({ tipo: 'cheques', inicial: null })}><Plus className="mr-2 h-4 w-4" /> Nuevo cheque</Button>
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">No se pudieron cargar los pagos: {error}</div>
      ) : (
        <>
          <AlertasPagos cheques={cheques} depositos={depositos} onIr={(t) => { cambiarTab(t); if (t === 'cheques') setFiltro((f) => ({ ...f, cheques: 'pendiente' })); if (t === 'depositos') setFiltro((f) => ({ ...f, depositos: 'pendientes' })); }} />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex gap-1 border-b border-slate-200 px-3 pt-3 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => cambiarTab(t.id)}
                  className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-ink'}`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                  <span className="text-xs text-slate-400">{t.id === 'depositos' ? depositos.length : t.id === 'cheques' ? cheques.length : proveedores.length}</span>
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Buscador value={q} onChange={(v) => { setQ(v); setVisibles(PAGINA); }} placeholder={tab === 'proveedores' ? 'Buscar proveedor, RUT, cuenta…' : 'Buscar proveedor, concepto, monto…'} />
                {tab === 'depositos' && (
                  <select value={filtro.depositos} onChange={(e) => { setFiltro((f) => ({ ...f, depositos: e.target.value })); setVisibles(PAGINA); }} className={selectClase}>
                    <option value="todos">Todos</option>
                    <option value="pendientes">Pendientes de pago</option>
                    <option value="pagados">Pagados</option>
                  </select>
                )}
                {tab === 'cheques' && (
                  <select value={filtro.cheques} onChange={(e) => { setFiltro((f) => ({ ...f, cheques: e.target.value })); setVisibles(PAGINA); }} className={selectClase}>
                    <option value="pendiente">Pendientes</option>
                    <option value="debitado">Debitados</option>
                    <option value="anulado">Anulados</option>
                    <option value="todos">Todos</option>
                  </select>
                )}
                {tab === 'proveedores' && (
                  <Button variant="outline" onClick={() => setForm({ tipo: 'proveedores', inicial: null })}><Plus className="mr-2 h-4 w-4" /> Nuevo proveedor</Button>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {lista.length} {tab === 'depositos' ? 'depósitos' : tab === 'cheques' ? 'cheques' : 'proveedores'}
                {totales && <> · Total: <b className="text-ink">{textoTotales(totales)}</b></>}
              </p>

              {tab === 'depositos' && (lista.length === 0 ? <Vacio texto="No hay depósitos con ese filtro." /> : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Proveedor</th>
                        <th className="px-3 py-2 text-left">Cuenta</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-center">Pagado</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.slice(0, visibles).map((d) => (
                        <tr key={d.id} className={`border-t border-slate-100 align-top ${d.pagado ? '' : 'bg-amber-50/60'}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fechaCorta(d.fecha)}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-ink">{d.proveedor}</div>
                            {d.concepto && <div className="text-xs text-slate-500">{d.concepto}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            <div>{d.banco || '—'}{d.tipo_cuenta && <span className="text-xs text-slate-400"> · {d.tipo_cuenta}</span>}</div>
                            <div className="text-xs tabular-nums">{d.numero_cuenta}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">{formatoMonto(d.monto, d.moneda)}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={!!d.pagado} onChange={() => togglePagado(d)} className="h-4 w-4 accent-green-600 cursor-pointer" aria-label="Pagado" />
                            {d.pagado && d.fecha_pagado && <div className="text-[11px] text-slate-400">{fechaCorta(d.fecha_pagado)}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" title="Enviar por WhatsApp" onClick={() => setWhatsapp({ deposito: d })}><MessageCircle className="h-4 w-4 text-green-600" /></Button>
                              <Button size="icon" variant="ghost" title="Editar" onClick={() => setForm({ tipo: 'depositos', inicial: d })}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" title="Eliminar" onClick={() => setABorrar({ tipo: 'depositos', fila: d })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {tab === 'cheques' && (lista.length === 0 ? <Vacio texto="No hay cheques con ese filtro." /> : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha de pago</th>
                        <th className="px-3 py-2 text-left">Proveedor</th>
                        <th className="px-3 py-2 text-left">Banco / Nº</th>
                        <th className="px-3 py-2 text-left">Entregado</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.slice(0, visibles).map((c) => {
                        const pendiente = c.estado === 'pendiente';
                        const urgencia = pendiente && c.fecha_pago && c.fecha_pago <= hoy ? 'bg-red-50' : pendiente && c.fecha_pago === manana ? 'bg-amber-50' : '';
                        return (
                          <tr key={c.id} className={`border-t border-slate-100 align-top ${urgencia}`}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-semibold">{fechaCorta(c.fecha_pago)}</span>
                              {pendiente && c.fecha_pago === hoy && <span className="block text-[11px] font-bold text-red-600">HOY</span>}
                              {pendiente && c.fecha_pago && c.fecha_pago < hoy && <span className="block text-[11px] font-bold text-red-600">Vencido</span>}
                              {pendiente && c.fecha_pago === manana && <span className="block text-[11px] font-bold text-amber-600">Mañana</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-ink">{c.proveedor}</div>
                              {c.concepto && <div className="text-xs text-slate-500">{c.concepto}</div>}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{c.banco || '—'}{c.numero && <div className="text-xs tabular-nums">Nº {c.numero}</div>}</td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fechaCorta(c.fecha_entrega)}</td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">{formatoMonto(c.monto, c.moneda)}</td>
                            <td className="px-3 py-2 text-center">
                              <select
                                value={c.estado}
                                onChange={(e) => cambiarEstado(c, e.target.value)}
                                className={`rounded-full px-2 py-1 text-xs font-bold border-0 cursor-pointer ${ESTADOS_CHEQUE[c.estado]?.clase || ''}`}
                                aria-label="Estado del cheque"
                              >
                                {Object.entries(ESTADOS_CHEQUE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" title="Editar" onClick={() => setForm({ tipo: 'cheques', inicial: c })}><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" title="Eliminar" onClick={() => setABorrar({ tipo: 'cheques', fila: c })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              {tab === 'proveedores' && (lista.length === 0 ? <Vacio texto="No hay proveedores." /> : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Proveedor</th>
                        <th className="px-3 py-2 text-left">Cuenta</th>
                        <th className="px-3 py-2 text-left">WhatsApp</th>
                        <th className="px-3 py-2 text-center">Depósitos</th>
                        <th className="px-3 py-2 text-center">Cheques</th>
                        <th className="px-3 py-2 text-center">Último pago</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lista.slice(0, visibles).map((p) => {
                        const r = resumenProveedor.get(p.id);
                        return (
                          <tr key={p.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-ink">{p.nombre}</div>
                              {p.rut && <div className="text-xs text-slate-500">RUT {p.rut}</div>}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              <div>{p.banco || '—'}{p.moneda === 'USD' && <span className="text-xs text-slate-400"> · U$S</span>}</div>
                              <div className="text-xs tabular-nums">{p.numero_cuenta}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{p.whatsapp || '—'}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{r?.depositos || 0}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{r?.cheques || 0}</td>
                            <td className="px-3 py-2 text-center text-slate-600">{fechaCorta(r?.ultimo)}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" title="Editar" onClick={() => setForm({ tipo: 'proveedores', inicial: p })}><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" title="Eliminar" onClick={() => setABorrar({ tipo: 'proveedores', fila: p })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              <MostrarMas total={lista.length} visibles={visibles} onMas={() => setVisibles((v) => v + PAGINA)} />
            </div>
          </div>
        </>
      )}

      <DepositoForm open={form?.tipo === 'depositos'} inicial={form?.tipo === 'depositos' ? form.inicial : null} proveedores={proveedores} onClose={() => setForm(null)} onSave={guardarDeposito} />
      <ChequeForm open={form?.tipo === 'cheques'} inicial={form?.tipo === 'cheques' ? form.inicial : null} proveedores={proveedores} onClose={() => setForm(null)} onSave={guardarCheque} />
      <ProveedorForm open={form?.tipo === 'proveedores'} inicial={form?.tipo === 'proveedores' ? form.inicial : null} onClose={() => setForm(null)} onSave={guardarProveedor} />

      {whatsapp && (
        <WhatsAppDialog deposito={whatsapp.deposito} titulo={whatsapp.titulo} config={config} onConfigChange={setConfig} onClose={() => setWhatsapp(null)} />
      )}

      <AlertDialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {aBorrar?.tipo === 'depositos' ? 'este depósito' : aBorrar?.tipo === 'cheques' ? 'este cheque' : 'este proveedor'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {aBorrar?.tipo === 'proveedores'
                ? `Se borra ${aBorrar?.fila?.nombre}. Sus depósitos y cheques quedan, pero sin proveedor vinculado. No se puede deshacer.`
                : `${aBorrar?.fila?.proveedor} · ${formatoMonto(aBorrar?.fila?.monto, aBorrar?.fila?.moneda)}. No se puede deshacer.`}
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

export default PagosView;
