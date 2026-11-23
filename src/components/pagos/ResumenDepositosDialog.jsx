import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Calculator, Copy, Loader2, MessageCircle } from 'lucide-react';
import { formatoMonto, hoyISO, mensajeResumenDepositos, sumarDias, totalesPorMoneda, urlWhatsApp } from '@/lib/pagos';

/**
 * Suma los depósitos de un día (hoy por defecto, o la fecha que se elija) en pesos y en dólares
 * y arma el texto para copiar y pegar en WhatsApp.
 */
const ResumenDepositosDialog = ({ open, onClose }) => {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(hoyISO());
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [filas, setFilas] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [numero, setNumero] = useState('');

  useEffect(() => {
    if (open) setFecha(hoyISO());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    supabase.from('pliego_config').select('whatsapp_pagos').limit(1).maybeSingle()
      .then(({ data }) => setNumero(data?.whatsapp_pagos || ''));
  }, [open]);

  useEffect(() => {
    if (!open || !fecha) return;
    let vigente = true;
    setFilas(null);
    supabase
      .from('depositos')
      .select('id, proveedor, monto, moneda, pagado, created_at')
      .eq('fecha', fecha)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          toast({ variant: 'destructive', title: 'No se pudieron leer los depósitos', description: error.message });
          setFilas([]);
        } else setFilas(data || []);
      });
    return () => { vigente = false; };
  }, [open, fecha, toast]);

  const incluidas = (filas || []).filter((d) => !soloPendientes || !d.pagado);
  const totales = totalesPorMoneda(incluidas);

  useEffect(() => {
    if (filas) setMensaje(mensajeResumenDepositos(fecha, incluidas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, soloPendientes, fecha]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast({ title: 'Resumen copiado', description: 'Pegalo en WhatsApp.' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Seleccioná el texto y copialo a mano.' });
    }
  };

  const contar = (moneda) => incluidas.filter((d) => (d.moneda || 'UYU') === moneda).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-brand" /> Resumen de depósitos del día</DialogTitle>
          <DialogDescription>Suma los depósitos en pesos y en dólares de la fecha elegida.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="resumen-fecha">Fecha</Label>
              <Input id="resumen-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-44" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setFecha(sumarDias(fecha || hoyISO(), -1))}>Día anterior</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFecha(hoyISO())}>Hoy</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFecha(sumarDias(fecha || hoyISO(), 1))}>Día siguiente</Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={soloPendientes} onCheckedChange={(v) => setSoloPendientes(!!v)} />
            Solo los que faltan pagar
          </label>

          {filas === null ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <span className="text-xs font-semibold text-slate-500">Pesos ({contar('UYU')})</span>
                  <b className="block text-lg tabular-nums">{formatoMonto(totales.UYU || 0, 'UYU')}</b>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <span className="text-xs font-semibold text-slate-500">Dólares ({contar('USD')})</span>
                  <b className="block text-lg tabular-nums">{formatoMonto(totales.USD || 0, 'USD')}</b>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="resumen-texto">Texto para WhatsApp</Label>
                <Textarea id="resumen-texto" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={10} className="font-mono text-sm" />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button variant="outline" onClick={() => window.open(urlWhatsApp(numero, mensaje), '_blank', 'noopener')} disabled={!filas}>
            <MessageCircle className="mr-2 h-4 w-4" /> Abrir WhatsApp
          </Button>
          <Button onClick={copiar} disabled={!filas}><Copy className="mr-2 h-4 w-4" /> Copiar texto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResumenDepositosDialog;
