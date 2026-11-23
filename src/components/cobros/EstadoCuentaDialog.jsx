import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Copy, MessageCircle, Pencil, Plus, Trash2, Wallet, FileText } from 'lucide-react';
import { fechaCorta, formatoMonto, urlWhatsApp } from '@/lib/pagos';
import { EMISORES, cuentaCorriente, mensajeEstadoCuenta } from '@/lib/cobros';

/** Estado de cuenta de un cliente con cuenta corriente: debe, haber y saldo, y texto para WhatsApp. */
const EstadoCuentaDialog = ({ cliente, facturas, cobros, onClose, onNuevaFactura, onNuevoCobro, onEditar, onBorrar, onEditarCliente }) => {
  const { toast } = useToast();
  const cuenta = useMemo(
    () => (cliente ? cuentaCorriente(facturas.filter((f) => f.cliente_id === cliente.id), cobros.filter((c) => c.cliente_id === cliente.id)) : null),
    [cliente, facturas, cobros],
  );
  const [mensaje, setMensaje] = useState('');
  const [verTexto, setVerTexto] = useState(false);
  useEffect(() => { if (cliente && cuenta) setMensaje(mensajeEstadoCuenta(cliente, cuenta)); }, [cliente, cuenta]);
  useEffect(() => { setVerTexto(false); }, [cliente?.id]);
  if (!cliente || !cuenta) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast({ title: 'Estado de cuenta copiado', description: 'Pegalo en WhatsApp.' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Seleccioná el texto y copialo a mano.' });
    }
  };
  const saldos = Object.entries(cuenta.saldos);
  const movs = cuenta.movimientos.slice().reverse();
  const pendientes = new Set(cuenta.pendientes.map((p) => p.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {cliente.nombre}
            <button type="button" onClick={() => onEditarCliente(cliente)} className="text-slate-400 hover:text-brand" title="Editar cliente"><Pencil className="h-4 w-4" /></button>
          </DialogTitle>
          <DialogDescription>{cliente.notas || 'Cuenta corriente'}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          {saldos.length === 0 && <div className="rounded-xl border bg-slate-50 px-4 py-2 font-bold">Sin movimientos</div>}
          {saldos.map(([m, v]) => (
            <div key={m} className={`rounded-xl border px-4 py-2 ${v > 0.5 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <span className="text-xs font-semibold text-slate-500">{v > 0.5 ? 'Saldo a cobrar' : v < -0.5 ? 'Saldo a favor del cliente' : 'Al día'}</span>
              <b className="block text-xl tabular-nums">{formatoMonto(Math.abs(v), m)}</b>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button variant="outline" onClick={() => onNuevaFactura(cliente)}><FileText className="mr-2 h-4 w-4" /> Nueva factura</Button>
            <Button onClick={() => onNuevoCobro(cliente)}><Wallet className="mr-2 h-4 w-4" /> Registrar pago</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copiar}><Copy className="mr-2 h-4 w-4" /> Copiar estado de cuenta</Button>
          <Button variant="outline" size="sm" onClick={() => window.open(urlWhatsApp(cliente.whatsapp || '', mensaje), '_blank', 'noopener')}>
            <MessageCircle className="mr-2 h-4 w-4" /> Abrir WhatsApp
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setVerTexto((v) => !v)}>{verTexto ? 'Ocultar texto' : 'Ver y editar el texto'}</Button>
        </div>
        {verTexto && <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={9} className="font-mono text-sm" />}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Movimiento</th>
                <th className="px-3 py-2 text-right">Debe</th>
                <th className="px-3 py-2 text-right">Haber</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {movs.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Todavía no hay facturas ni pagos.</td></tr>}
              {movs.map((m) => (
                <tr key={`${m.tipo}-${m.fila.id}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{fechaCorta(m.fecha)}</td>
                  <td className="px-3 py-2">
                    {m.tipo === 'factura' ? (
                      <>
                        Factura <b>{m.fila.numero || 's/n'}</b>
                        {pendientes.has(m.fila.id) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">pendiente</span>}
                      </>
                    ) : (
                      <span className="text-green-700 font-semibold">Pago{m.fila.medio ? ` · ${m.fila.medio}` : ''}</span>
                    )}
                    {m.fila.detalle && <span className="block text-xs text-slate-500">{m.fila.detalle}</span>}
                    {m.fila.emisor !== 'comprasuy' && <span className="block text-xs text-slate-500">{EMISORES[m.fila.emisor]}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.debe ? formatoMonto(m.debe, m.moneda) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-green-700">{m.haber ? formatoMonto(m.haber, m.moneda) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{formatoMonto(m.saldo, m.moneda)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button type="button" onClick={() => onEditar(m.tipo, m.fila)} className="p-1 text-slate-400 hover:text-brand" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => onBorrar(m.tipo, m.fila)} className="p-1 text-slate-400 hover:text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onNuevaFactura(cliente)}><Plus className="mr-1 h-4 w-4" /> Agregar factura</Button>
      </DialogContent>
    </Dialog>
  );
};

export default EstadoCuentaDialog;
