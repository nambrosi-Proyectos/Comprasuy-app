import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';

const VACIO = { nombre: '', cantidad: '1', precio_unitario: '', iva: '22' };

/**
 * Formulario fijo para cargar ítems que no están guardados para el cliente.
 * Al añadir uno se limpia y vuelve a la descripción, listo para el siguiente (Enter también añade).
 */
const QuickAddItem = ({ onAdd, disabled, moneda }) => {
  const [form, setForm] = useState(VACIO);
  const nombreRef = useRef(null);
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const listo = form.nombre.trim() && parseFloat(form.cantidad) > 0;

  const añadir = (e) => {
    e.preventDefault();
    if (!listo || disabled) return;
    onAdd({
      nombre: form.nombre.trim(),
      cantidad: parseFloat(form.cantidad) || 1,
      precio_unitario: parseFloat(form.precio_unitario) || 0,
      iva: parseFloat(form.iva) || 0,
    });
    setForm((f) => ({ ...VACIO, iva: f.iva }));
    nombreRef.current?.focus();
  };

  return (
    <form onSubmit={añadir} className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
      <Label className="font-semibold">Agregar ítems manuales (no guardados para este cliente)</Label>
      <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
        <div className="col-span-2 md:col-span-5">
          <Input ref={nombreRef} value={form.nombre} onChange={set('nombre')} placeholder="Descripción del ítem" disabled={disabled} />
        </div>
        <div className="md:col-span-2">
          <Input type="number" min="0" step="any" value={form.cantidad} onChange={set('cantidad')} placeholder="Cantidad" aria-label="Cantidad" disabled={disabled} />
        </div>
        <div className="md:col-span-2">
          <Input type="number" min="0" step="any" value={form.precio_unitario} onChange={set('precio_unitario')} placeholder={`Precio (${moneda})`} aria-label="Precio unitario sin IVA" disabled={disabled} />
        </div>
        <div className="md:col-span-1">
          <select
            value={form.iva}
            onChange={set('iva')}
            aria-label="IVA"
            disabled={disabled}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="22">22%</option>
            <option value="10">10%</option>
            <option value="0">0%</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={disabled || !listo} className="w-full">
            <Plus className="mr-1 h-4 w-4" /> Añadir
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">Enter añade el ítem y deja el formulario listo para el siguiente.</p>
    </form>
  );
};

export default QuickAddItem;
