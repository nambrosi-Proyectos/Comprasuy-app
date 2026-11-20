import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { MessageCircle, Copy, CheckCircle2 } from 'lucide-react';
import { mensajeDeposito, numeroWhatsApp, urlWhatsApp } from '@/lib/pagos';

/**
 * Después de cargar un depósito (o desde la lista): arma el mensaje con los datos para transferir
 * y abre WhatsApp con el texto listo. El envío lo confirma el usuario en WhatsApp.
 */
const WhatsAppDialog = ({ deposito, config, onConfigChange, onClose, titulo }) => {
  const { toast } = useToast();
  const [numero, setNumero] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [recordar, setRecordar] = useState(false);

  useEffect(() => {
    if (!deposito) return;
    setNumero(config?.whatsapp_pagos || '');
    setMensaje(mensajeDeposito(deposito));
    setRecordar(!config?.whatsapp_pagos);
  }, [deposito, config]);

  if (!deposito) return null;

  const guardarNumero = async () => {
    const valores = { whatsapp_pagos: numero.trim() };
    const { data, error } = config?.id
      ? await supabase.from('pliego_config').update(valores).eq('id', config.id).select('id, whatsapp_pagos').single()
      : await supabase.from('pliego_config').insert(valores).select('id, whatsapp_pagos').single();
    if (error) toast({ variant: 'destructive', title: 'No se pudo guardar el número', description: error.message });
    else onConfigChange?.(data);
  };

  const enviar = async () => {
    if (!numeroWhatsApp(numero)) {
      toast({ variant: 'destructive', title: 'Falta el número', description: 'Escribí a qué WhatsApp mandar el aviso.' });
      return;
    }
    if (recordar && numero.trim() !== (config?.whatsapp_pagos || '')) await guardarNumero();
    window.open(urlWhatsApp(numero, mensaje), '_blank', 'noopener');
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast({ title: 'Mensaje copiado' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar' });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {titulo ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <MessageCircle className="h-5 w-5 text-green-600" />}
            {titulo || 'Enviar por WhatsApp'}
          </DialogTitle>
          <DialogDescription>Se abre WhatsApp con el mensaje listo; lo enviás desde ahí.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wa-numero">Enviar a</Label>
            <Input id="wa-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="099 123 456" inputMode="tel" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox checked={recordar} onCheckedChange={(v) => setRecordar(!!v)} />
              Usar este número por defecto
            </label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-mensaje">Mensaje</Label>
            <Textarea id="wa-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={copiar}><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={enviar} className="bg-green-600 hover:bg-green-700">
            <MessageCircle className="mr-2 h-4 w-4" /> Enviar por WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppDialog;
