import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { hoyISO, formatoMonto, fechaCorta } from '@/lib/pagos';
import { EMISORES, MEDIOS_COBRO, claveCliente } from '@/lib/cobros';

const Campo = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label>{label}</Label>
    {children}
  </div>
);

const selectClase = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const aNumero = (v) => parseFloat(String(v).replace(',', '.')) || 0;

const Pie = ({ onClose, saving, texto, extra }) => (
  <DialogFooter className="gap-2 sm:gap-0 pt-2">
    {extra}
    <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
    <Button type="submit" disabled={saving}>
      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {texto}
    </Button>
  </DialogFooter>
);

const EmisorSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClase}>
    {Object.entries(EMISORES).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
  </select>
);

const MonedaSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClase} aria-label="Moneda">
    <option value="UYU">$ Pesos</option>
    <option value="USD">U$S Dólares</option>
  </select>
);

const ClienteInput = ({ value, onChange, clientes, autoFocus, id = 'lista-cobro-clientes' }) => (
  <>
    <Input list={id} value={value} autoFocus={autoFocus} placeholder="Organismo o cliente" required onChange={(e) => onChange(e.target.value)} />
    <datalist id={id}>{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
  </>
);

// ---------- Factura ----------

const FACTURA_VACIA = { emisor: 'comprasuy', cliente: '', numero: '', fecha: '', oc: '', moneda: 'UYU', importe: '', detalle: '', cobrada: false, fecha_cobro: '', modalidad: 'factura' };

export const FacturaForm = ({ open, inicial, clientes, onClose, onSave }) => {
  const [form, setForm] = useState(FACTURA_VACIA);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...FACTURA_VACIA, ...inicial, importe: String(inicial.importe ?? '') } : { ...FACTURA_VACIA, fecha: hoyISO() });
  }, [open, inicial]);
  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor?.target ? valor.target.value : valor }));
  const porClave = useMemo(() => new Map(clientes.map((c) => [c.clave, c])), [clientes]);
  const existente = porClave.get(claveCliente(form.cliente));
  const modalidad = existente?.modalidad || form.modalidad;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, importe: aNumero(form.importe), modalidad });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{inicial?.id ? 'Editar factura' : 'Nueva factura'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Factura a nombre de"><EmisorSelect value={form.emisor} onChange={set('emisor')} /></Campo>
          <Campo label="Cliente"><ClienteInput value={form.cliente} onChange={set('cliente')} clientes={clientes} autoFocus={!inicial} /></Campo>
          {!existente && form.cliente.trim() && (
            <Campo label="Cliente nuevo: ¿cómo se cobra?" className="sm:col-span-2">
              <select value={form.modalidad} onChange={set('modalidad')} className={selectClase}>
                <option value="factura">Organismo del Estado: cada factura se marca cobrada</option>
                <option value="cuenta">Privado con cuenta corriente: se registran los pagos</option>
              </select>
            </Campo>
          )}
          <Campo label="Nº de factura"><Input value={form.numero || ''} onChange={set('numero')} placeholder="Ej. 2468" /></Campo>
          <Campo label="Fecha"><Input type="date" value={form.fecha || ''} onChange={set('fecha')} required /></Campo>
          <Campo label="Orden de compra"><Input value={form.oc || ''} onChange={set('oc')} placeholder="Nº de OC" /></Campo>
          <Campo label="Moneda"><MonedaSelect value={form.moneda} onChange={set('moneda')} /></Campo>
          <Campo label="Importe"><Input type="number" step="any" min="0" required value={form.importe} onChange={set('importe')} placeholder="0" /></Campo>
          <Campo label="Detalle"><Input value={form.detalle || ''} onChange={set('detalle')} placeholder="Opcional" /></Campo>
          {modalidad === 'factura' && (
            <div className="sm:col-span-2 flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm h-10">
                <input type="checkbox" checked={!!form.cobrada} onChange={(e) => setForm((f) => ({ ...f, cobrada: e.target.checked, fecha_cobro: e.target.checked ? f.fecha_cobro || hoyISO() : '' }))} className="h-4 w-4 accent-green-600" />
                Ya está cobrada
              </label>
              {form.cobrada && <Campo label="Fecha de cobro"><Input type="date" value={form.fecha_cobro || ''} onChange={set('fecha_cobro')} /></Campo>}
            </div>
          )}
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto={inicial?.id ? 'Guardar cambios' : 'Guardar factura'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Pago recibido (cuenta corriente) ----------

const COBRO_VACIO = { emisor: 'comprasuy', cliente: '', fecha: '', moneda: 'UYU', importe: '', medio: '', detalle: '' };

export const CobroForm = ({ open, inicial, clientes, onClose, onSave }) => {
  const [form, setForm] = useState(COBRO_VACIO);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...COBRO_VACIO, ...inicial, importe: String(inicial.importe ?? '') } : { ...COBRO_VACIO, fecha: hoyISO() });
  }, [open, inicial]);
  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor?.target ? valor.target.value : valor }));
  const deCuenta = clientes.filter((c) => c.modalidad === 'cuenta');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, importe: aNumero(form.importe) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{inicial?.id ? 'Editar pago recibido' : 'Registrar pago recibido'}</DialogTitle>
          <DialogDescription>Para clientes con cuenta corriente. Se descuenta del saldo, empezando por las facturas más viejas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Cliente"><ClienteInput value={form.cliente} onChange={set('cliente')} clientes={deCuenta} autoFocus={!inicial && !form.cliente} id="lista-clientes-cuenta" /></Campo>
          <Campo label="Cuenta"><EmisorSelect value={form.emisor} onChange={set('emisor')} /></Campo>
          <Campo label="Fecha"><Input type="date" value={form.fecha || ''} onChange={set('fecha')} required /></Campo>
          <Campo label="Medio">
            <Input list="lista-medios-cobro" value={form.medio || ''} onChange={set('medio')} placeholder="Transferencia, Abitab…" />
            <datalist id="lista-medios-cobro">{MEDIOS_COBRO.map((m) => <option key={m} value={m} />)}</datalist>
          </Campo>
          <Campo label="Moneda"><MonedaSelect value={form.moneda} onChange={set('moneda')} /></Campo>
          <Campo label="Importe"><Input type="number" step="any" min="0" required value={form.importe} onChange={set('importe')} placeholder="0" autoFocus={!inicial && !!form.cliente} /></Campo>
          <Campo label="Detalle" className="sm:col-span-2"><Input value={form.detalle || ''} onChange={set('detalle')} placeholder="Opcional" /></Campo>
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto={inicial?.id ? 'Guardar cambios' : 'Registrar pago'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Cliente ----------

const CLIENTE_VACIO = { nombre: '', tipo: 'estado', modalidad: 'factura', rut: '', whatsapp: '', notas: '' };

export const ClienteCobroForm = ({ open, inicial, onClose, onSave }) => {
  const [form, setForm] = useState(CLIENTE_VACIO);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...CLIENTE_VACIO, ...inicial } : CLIENTE_VACIO);
  }, [open, inicial]);
  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor?.target ? valor.target.value : valor }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{inicial?.id ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nombre" className="sm:col-span-2"><Input value={form.nombre} onChange={set('nombre')} required autoFocus /></Campo>
          <Campo label="Cómo se cobra" className="sm:col-span-2">
            <select
              value={form.modalidad}
              onChange={(e) => setForm((f) => ({ ...f, modalidad: e.target.value, tipo: e.target.value === 'cuenta' ? 'privado' : 'estado' }))}
              className={selectClase}
            >
              <option value="factura">Organismo del Estado: cada factura se marca cobrada</option>
              <option value="cuenta">Privado con cuenta corriente: se registran los pagos</option>
            </select>
          </Campo>
          <Campo label="RUT"><Input value={form.rut || ''} onChange={set('rut')} /></Campo>
          <Campo label="WhatsApp"><Input value={form.whatsapp || ''} onChange={set('whatsapp')} placeholder="099 123 456" inputMode="tel" /></Campo>
          <Campo label="Notas" className="sm:col-span-2"><Input value={form.notas || ''} onChange={set('notas')} /></Campo>
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto={inicial?.id ? 'Guardar cambios' : 'Guardar cliente'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Marcar una factura del Estado como cobrada ----------

export const MarcarCobradaDialog = ({ factura, onClose, onSave }) => {
  const [fecha, setFecha] = useState(hoyISO());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (factura) setFecha(factura.fecha_cobro || hoyISO()); }, [factura]);
  if (!factura) return null;
  const guardar = async (cambios) => {
    setSaving(true);
    try { await onSave(factura, cambios); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{factura.cobrada ? 'Factura cobrada' : 'Marcar como cobrada'}</DialogTitle>
          <DialogDescription>
            {factura.cliente} · Factura {factura.numero || 's/n'} del {fechaCorta(factura.fecha)} · <b>{formatoMonto(factura.importe, factura.moneda)}</b>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); guardar({ cobrada: true, fecha_cobro: fecha || null }); }} className="space-y-3">
          <Campo label="Fecha de cobro"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus /></Campo>
          <Pie
            onClose={onClose}
            saving={saving}
            texto={factura.cobrada ? 'Guardar fecha' : 'Marcar cobrada'}
            extra={factura.cobrada && (
              <Button type="button" variant="outline" className="text-red-700" disabled={saving} onClick={() => guardar({ cobrada: false, fecha_cobro: null })}>
                Volver a pendiente
              </Button>
            )}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
