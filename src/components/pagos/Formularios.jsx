import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { BANCOS, TIPOS_CUENTA, ESTADOS_CHEQUE, claveProveedor, hoyISO } from '@/lib/pagos';

const Campo = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label>{label}</Label>
    {children}
  </div>
);

const selectClase = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

const MonedaSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClase} aria-label="Moneda">
    <option value="UYU">$ Pesos</option>
    <option value="USD">U$S Dólares</option>
  </select>
);

/** Input con sugerencias de proveedores ya cargados; al elegir uno avisa para completar la cuenta. */
const ProveedorInput = ({ value, onChange, proveedores, onElegir, autoFocus }) => {
  const porClave = useMemo(() => new Map(proveedores.map((p) => [claveProveedor(p.nombre), p])), [proveedores]);
  return (
    <>
      <Input
        list="lista-proveedores"
        value={value}
        autoFocus={autoFocus}
        placeholder="Nombre del proveedor"
        onChange={(e) => {
          onChange(e.target.value);
          const p = porClave.get(claveProveedor(e.target.value));
          if (p && p.nombre === e.target.value) onElegir?.(p);
        }}
        onBlur={(e) => {
          const p = porClave.get(claveProveedor(e.target.value));
          if (p) onElegir?.(p);
        }}
      />
      <datalist id="lista-proveedores">
        {proveedores.map((p) => <option key={p.id} value={p.nombre} />)}
      </datalist>
    </>
  );
};

const BancoInput = ({ value, onChange }) => (
  <>
    <Input list="lista-bancos" value={value} onChange={(e) => onChange(e.target.value)} placeholder="BROU, ITAU…" />
    <datalist id="lista-bancos">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
  </>
);

const Pie = ({ onClose, saving, texto }) => (
  <DialogFooter className="gap-2 sm:gap-0 pt-2">
    <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
    <Button type="submit" disabled={saving}>
      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {texto}
    </Button>
  </DialogFooter>
);

// ---------- Depósito ----------

const DEPOSITO_VACIO = { fecha: '', proveedor: '', banco: '', tipo_cuenta: '', numero_cuenta: '', moneda: 'UYU', monto: '', concepto: '', pagado: false };

export const DepositoForm = ({ open, inicial, proveedores, onClose, onSave }) => {
  const [form, setForm] = useState(DEPOSITO_VACIO);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...DEPOSITO_VACIO, ...inicial, monto: String(inicial.monto ?? '') } : { ...DEPOSITO_VACIO, fecha: hoyISO() });
  }, [open, inicial]);
  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor?.target ? valor.target.value : valor }));
  const completarCuenta = (p) =>
    setForm((f) => ({
      ...f,
      proveedor: p.nombre,
      banco: f.banco || p.banco || '',
      tipo_cuenta: f.tipo_cuenta || p.tipo_cuenta || '',
      numero_cuenta: f.numero_cuenta || p.numero_cuenta || '',
      moneda: f.numero_cuenta ? f.moneda : p.moneda || f.moneda,
    }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, monto: parseFloat(String(form.monto).replace(',', '.')) || 0 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{inicial?.id ? 'Editar depósito' : 'Nuevo depósito a pagar'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Proveedor" className="sm:col-span-2">
            <ProveedorInput value={form.proveedor} onChange={set('proveedor')} proveedores={proveedores} onElegir={completarCuenta} autoFocus={!inicial} />
          </Campo>
          <Campo label="Banco"><BancoInput value={form.banco} onChange={set('banco')} /></Campo>
          <Campo label="Tipo de cuenta">
            <select value={form.tipo_cuenta || ''} onChange={set('tipo_cuenta')} className={selectClase}>
              <option value="">—</option>
              {TIPOS_CUENTA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Número de cuenta" className="sm:col-span-2"><Input value={form.numero_cuenta || ''} onChange={set('numero_cuenta')} placeholder="Ej. 001568490-00069" /></Campo>
          <Campo label="Moneda"><MonedaSelect value={form.moneda} onChange={set('moneda')} /></Campo>
          <Campo label="Monto"><Input type="number" step="any" min="0" required value={form.monto} onChange={set('monto')} placeholder="0" /></Campo>
          <Campo label="Fecha"><Input type="date" value={form.fecha || ''} onChange={set('fecha')} /></Campo>
          <Campo label="Concepto"><Input value={form.concepto || ''} onChange={set('concepto')} placeholder="Ej. sueldo, alquiler, canastas" /></Campo>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.pagado} onChange={(e) => setForm((f) => ({ ...f, pagado: e.target.checked }))} className="h-4 w-4 accent-green-600" />
            Ya está pagado
          </label>
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto={inicial?.id ? 'Guardar cambios' : 'Guardar depósito'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Cheque ----------

const CHEQUE_VACIO = { proveedor: '', fecha_entrega: '', fecha_pago: '', banco: 'BROU', numero: '', moneda: 'UYU', monto: '', concepto: '', estado: 'pendiente' };

export const ChequeForm = ({ open, inicial, proveedores, onClose, onSave }) => {
  const [form, setForm] = useState(CHEQUE_VACIO);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...CHEQUE_VACIO, ...inicial, monto: String(inicial.monto ?? '') } : { ...CHEQUE_VACIO, fecha_entrega: hoyISO() });
  }, [open, inicial]);
  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor?.target ? valor.target.value : valor }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, monto: parseFloat(String(form.monto).replace(',', '.')) || 0 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{inicial?.id ? 'Editar cheque' : 'Nuevo cheque emitido'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Proveedor" className="sm:col-span-2">
            <ProveedorInput value={form.proveedor} onChange={set('proveedor')} proveedores={proveedores} autoFocus={!inicial} />
          </Campo>
          <Campo label="Fecha de entrega"><Input type="date" value={form.fecha_entrega || ''} onChange={set('fecha_entrega')} /></Campo>
          <Campo label="Fecha de pago (se debita)"><Input type="date" required value={form.fecha_pago || ''} onChange={set('fecha_pago')} /></Campo>
          <Campo label="Banco"><BancoInput value={form.banco} onChange={set('banco')} /></Campo>
          <Campo label="Nº de cheque"><Input value={form.numero || ''} onChange={set('numero')} placeholder="Opcional" /></Campo>
          <Campo label="Moneda"><MonedaSelect value={form.moneda} onChange={set('moneda')} /></Campo>
          <Campo label="Monto"><Input type="number" step="any" min="0" required value={form.monto} onChange={set('monto')} placeholder="0" /></Campo>
          <Campo label="Para qué es" className="sm:col-span-2"><Input value={form.concepto || ''} onChange={set('concepto')} placeholder="Ej. canastas armada, stock" /></Campo>
          {inicial?.id && (
            <Campo label="Estado">
              <select value={form.estado} onChange={set('estado')} className={selectClase}>
                {Object.entries(ESTADOS_CHEQUE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Campo>
          )}
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto={inicial?.id ? 'Guardar cambios' : 'Guardar cheque'} /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Proveedor ----------

const PROVEEDOR_VACIO = { nombre: '', rut: '', whatsapp: '', banco: '', tipo_cuenta: '', numero_cuenta: '', moneda: 'UYU', notas: '' };

export const ProveedorForm = ({ open, inicial, onClose, onSave }) => {
  const [form, setForm] = useState(PROVEEDOR_VACIO);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(inicial ? { ...PROVEEDOR_VACIO, ...inicial } : PROVEEDOR_VACIO);
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
        <DialogHeader><DialogTitle>{inicial?.id ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nombre" className="sm:col-span-2"><Input required autoFocus value={form.nombre} onChange={set('nombre')} /></Campo>
          <Campo label="RUT"><Input value={form.rut || ''} onChange={set('rut')} placeholder="Opcional" /></Campo>
          <Campo label="WhatsApp"><Input value={form.whatsapp || ''} onChange={set('whatsapp')} placeholder="099 123 456" inputMode="tel" /></Campo>
          <Campo label="Banco"><BancoInput value={form.banco || ''} onChange={set('banco')} /></Campo>
          <Campo label="Tipo de cuenta">
            <select value={form.tipo_cuenta || ''} onChange={set('tipo_cuenta')} className={selectClase}>
              <option value="">—</option>
              {TIPOS_CUENTA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Número de cuenta"><Input value={form.numero_cuenta || ''} onChange={set('numero_cuenta')} /></Campo>
          <Campo label="Moneda de la cuenta"><MonedaSelect value={form.moneda || 'UYU'} onChange={set('moneda')} /></Campo>
          <Campo label="Notas" className="sm:col-span-2"><Input value={form.notas || ''} onChange={set('notas')} /></Campo>
          <div className="sm:col-span-2"><Pie onClose={onClose} saving={saving} texto="Guardar proveedor" /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
