import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Building2, Save, PenLine, Upload, Trash2 } from 'lucide-react';
import { CONDICIONES_PLIEGO } from '@/lib/empresa';

const FIELDS = [
  { name: 'razon_social', label: 'Razón social' },
  { name: 'rut', label: 'RUT' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'email', label: 'Correo' },
  { name: 'telefono', label: 'Teléfono' },
  { name: 'whatsapp_pagos', label: 'WhatsApp para avisos de pago (ej. 099 123 456)' },
];

const MAX_FIRMA_BYTES = 5 * 1024 * 1024;
const MAX_FIRMA_ANCHO = 800;

/** Lee la imagen y la achica (máx. 800 px de ancho) como PNG, conservando la transparencia. */
const firmaADataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const escala = Math.min(1, MAX_FIRMA_ANCHO / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/** Datos de la empresa que aparecen en el PDF de los presupuestos (tabla pliego_config). */
const EmpresaManagement = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from('pliego_config').select('*').limit(1).maybeSingle().then(({ data, error }) => {
      if (error) toast({ variant: 'destructive', title: 'Error al cargar datos de la empresa', description: error.message });
      else setConfig(data || {});
      setLoading(false);
    });
  }, [toast]);

  const handleChange = (e) => setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleFirma = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      return toast({ variant: 'destructive', title: 'Formato no válido', description: 'Subí una imagen PNG, JPG o WEBP.' });
    }
    if (file.size > MAX_FIRMA_BYTES) {
      return toast({ variant: 'destructive', title: 'Imagen muy grande', description: 'La firma debe pesar menos de 5 MB.' });
    }
    try {
      const firma = await firmaADataUrl(file);
      setConfig(prev => ({ ...prev, firma_imagen: firma }));
      toast({ title: 'Firma cargada', description: 'Tocá Guardar para que quede en los pliegos.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la firma', description: error.message });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const values = { razon_social: config.razon_social, rut: config.rut, direccion: config.direccion, email: config.email, telefono: config.telefono, whatsapp_pagos: config.whatsapp_pagos || null, footer_texto: config.footer_texto, firma_imagen: config.firma_imagen || null, condiciones_pliego: config.condiciones_pliego || null };
    const { data, error } = config.id
      ? await supabase.from('pliego_config').update(values).eq('id', config.id).select().single()
      : await supabase.from('pliego_config').insert(values).select().single();
    setSaving(false);
    if (error) return toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    setConfig(data);
    toast({ title: '✅ Datos de la empresa guardados' });
  };

  return (
    <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-full">
      <h2 className="text-2xl font-semibold mb-1 flex items-center"><Building2 className="mr-2 h-6 w-6" /> Datos de la empresa</h2>
      <p className="text-sm text-slate-500 mb-4">Se muestran en el encabezado y pie de los pliegos y presupuestos.</p>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.name} className="space-y-1">
                <Label htmlFor={`emp-${f.name}`}>{f.label}</Label>
                <Input id={`emp-${f.name}`} name={f.name} value={config[f.name] || ''} onChange={handleChange} />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-footer">Texto al pie del presupuesto</Label>
            <Textarea id="emp-footer" name="footer_texto" rows={3} value={config.footer_texto || ''} onChange={handleChange} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-condiciones">Condiciones y aclaraciones del pliego (una por línea)</Label>
            <Textarea id="emp-condiciones" name="condiciones_pliego" rows={4} value={config.condiciones_pliego ?? CONDICIONES_PLIEGO} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><PenLine className="h-4 w-4" /> Firma del pliego</Label>
            <p className="text-xs text-slate-500">Va al pie del pliego (vista, PDF y copia para Word). Mejor un PNG con fondo transparente.</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="h-28 w-full sm:w-64 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {config.firma_imagen
                  ? <img src={config.firma_imagen} alt="Firma" className="max-h-24 max-w-full object-contain" />
                  : <span className="text-sm text-slate-400">Sin firma cargada</span>}
              </div>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFirma} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {config.firma_imagen ? 'Cambiar' : 'Subir firma'}
                </Button>
                {config.firma_imagen && (
                  <Button type="button" variant="destructive" onClick={() => setConfig(prev => ({ ...prev, firma_imagen: null }))}>
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                )}
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmpresaManagement;
