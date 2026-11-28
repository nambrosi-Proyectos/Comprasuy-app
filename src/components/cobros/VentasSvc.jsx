import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Copy, Loader2, MessageCircle, RotateCcw, Search } from 'lucide-react';
import { fechaCorta, formatoMonto, hoyISO, urlWhatsApp } from '@/lib/pagos';
import { MEDIOS_COBRO_SVC, diasEntre, mensajeVentasSvc } from '@/lib/cobros';
import { cobrarVentaSvc, deshacerCobroSvc } from '@/components/cobros/useCobros';

const selectClase = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand';
const colorDias = (d) => (d > 90 ? 'bg-red-100 text-red-800' : d > 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700');
const LISTAS = { comercio: 'Comercio', institucion: 'Institución', remar: 'REMAR' };

/** Marca cobrada una venta de SVC: fecha y medio de pago. */
const CobrarDialog = ({ venta, onClose, onCobrada }) => {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(hoyISO());
  const [medio, setMedio] = useState('Transferencia');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  if (!venta) return null;
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      onCobrada(await cobrarVentaSvc(venta.id, { fecha, medio, nota }));
      toast({ title: 'Venta cobrada', description: `N° ${venta.numero} · ${venta.cliente}. En SVC ya figura como pagada.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo marcar cobrada', description: err.message });
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar venta N° {venta.numero}</DialogTitle>
          <DialogDescription>{venta.cliente} · {fechaCorta(venta.fecha)} · <b>{formatoMonto(venta.total)}</b></DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Fecha de cobro</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
            <div className="space-y-1">
              <Label>Medio</Label>
              <select value={medio} onChange={(e) => setMedio(e.target.value)} className={`${selectClase} w-full`}>
                {MEDIOS_COBRO_SVC.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1"><Label>Nota (opcional)</Label><Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: transferencia BROU" /></div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Marcar cobrada</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Estado de cuenta de las compras pendientes de un cliente, para copiar o mandar por WhatsApp. */
const MensajeDialog = ({ cliente, ventas, onClose }) => {
  const { toast } = useToast();
  const [texto, setTexto] = useState(() => (cliente ? mensajeVentasSvc(cliente, ventas) : ''));
  if (!cliente) return null;
  const telefono = ventas.find((v) => v.telefono)?.telefono || '';
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: 'Texto copiado', description: 'Pegalo en WhatsApp.' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Seleccioná el texto y copialo a mano.' });
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente}</DialogTitle>
          <DialogDescription>Compras pendientes de pago en Ventas (SVC).{telefono ? ` Teléfono: ${telefono}.` : ''}</DialogDescription>
        </DialogHeader>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} className="font-mono text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copiar}><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
          <Button onClick={() => window.open(urlWhatsApp(telefono, texto), '_blank', 'noopener')}><MessageCircle className="mr-2 h-4 w-4" /> Abrir WhatsApp</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Pestaña de Cobros con las ventas de SVC: lo que falta cobrar y lo que ya se cobró. */
const VentasSvc = ({ ventas, setVentas, esAdmin, busquedaInicial = '' }) => {
  const { toast } = useToast();
  const [q, setQ] = useState(busquedaInicial);
  const [estado, setEstado] = useState('pendientes');
  const [cobrar, setCobrar] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const hoy = hoyISO();
  const query = q.trim().toLowerCase();

  const lista = useMemo(() => ventas
    .filter((v) => (estado === 'pendientes' ? v.estado === 'pendiente' : estado === 'cobradas' ? v.estado !== 'pendiente' : true))
    .filter((v) => !query || [v.cliente, v.rut, v.vendedor, v.numero, v.total].join(' ').toLowerCase().includes(query))
    .sort((a, b) => (estado === 'pendientes' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha))),
  [ventas, estado, query]);
  const total = lista.filter((v) => v.estado === 'pendiente').reduce((a, v) => a + v.total, 0);
  const pendientesDe = (cliente) => ventas.filter((v) => v.cliente === cliente && v.estado === 'pendiente');
  const reemplazar = (v) => setVentas((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...v, telefono: x.telefono || v.telefono } : x)));

  const deshacer = async (v) => {
    if (!window.confirm(`¿Volver a pendiente la venta N° ${v.numero}? En SVC vuelve a figurar sin cobrar.`)) return;
    try {
      reemplazar(await deshacerCobroSvc(v.id));
      toast({ title: 'La venta volvió a pendiente' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo deshacer', description: e.message });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Ventas de SVC que quedaron <b>pendientes de pago</b>. Al marcarlas cobradas acá, en SVC pasan a "pagada" con esa fecha (cuenta para las comisiones).
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative block flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, RUT, vendedor, N° de venta…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClase} aria-label="Estado">
          <option value="pendientes">Pendientes de cobro</option>
          <option value="cobradas">Cobradas (últimos meses)</option>
          <option value="todas">Todas</option>
        </select>
        {estado !== 'cobradas' && <span className="text-sm text-slate-600">Total pendiente: <b className="tabular-nums">{formatoMonto(total)}</b></span>}
      </div>

      {!ventas.length && <p className="rounded-xl border border-dashed p-6 text-center text-slate-500">No hay ventas de SVC (o todavía no se migraron).</p>}
      {!!ventas.length && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Venta</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Vendedor</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!lista.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No hay ventas con ese filtro.</td></tr>}
              {lista.map((v) => {
                const dias = diasEntre(v.fecha, hoy);
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{fechaCorta(v.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">N° {v.numero}<span className="block text-xs text-slate-500">{LISTAS[v.lista] || v.lista}{v.pago ? ` · ${v.pago}` : ''}</span></td>
                    <td className="px-3 py-2">
                      <button type="button" className="font-semibold hover:text-brand text-left" onClick={() => setQ(v.cliente)}>{v.cliente}</button>
                      {v.rut && <span className="block text-xs text-slate-500">RUT {v.rut}</span>}
                    </td>
                    <td className="px-3 py-2">{v.vendedor}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{formatoMonto(v.total)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {v.estado === 'pendiente'
                        ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorDias(dias)}`}>{dias} días</span>
                        : <span className="text-green-700 text-xs font-semibold">Cobrada{v.pagadaEl ? ` el ${fechaCorta(v.pagadaEl)}` : ''}{v.cobro?.medio ? ` · ${v.cobro.medio}` : ''}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {v.estado === 'pendiente' ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setMensaje(v.cliente)} title="Estado de cuenta por WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                          <Button size="sm" onClick={() => setCobrar(v)}><CheckCircle2 className="mr-1 h-4 w-4" /> Marcar cobrada</Button>
                        </div>
                      ) : (esAdmin && v.cobro && (
                        <Button size="sm" variant="ghost" onClick={() => deshacer(v)} title="Volver a pendiente"><RotateCcw className="h-4 w-4" /></Button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CobrarDialog key={cobrar?.id} venta={cobrar} onClose={() => setCobrar(null)} onCobrada={(v) => { reemplazar(v); setCobrar(null); }} />
      {mensaje && <MensajeDialog key={mensaje} cliente={mensaje} ventas={pendientesDe(mensaje)} onClose={() => setMensaje(null)} />}
    </div>
  );
};

export default VentasSvc;
