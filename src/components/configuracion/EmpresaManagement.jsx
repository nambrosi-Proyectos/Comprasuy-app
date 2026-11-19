import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Building2, Save } from 'lucide-react';

const FIELDS = [
  { name: 'razon_social', label: 'Razón social' },
  { name: 'rut', label: 'RUT' },
  { name: 'direccion', label: 'Dirección' },
  { name: 'email', label: 'Correo' },
  { name: 'telefono', label: 'Teléfono' },
];

/** Datos de la empresa que aparecen en el PDF de los presupuestos (tabla pliego_config). */
const EmpresaManagement = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('pliego_config').select('*').limit(1).maybeSingle().then(({ data, error }) => {
      if (error) toast({ variant: 'destructive', title: 'Error al cargar datos de la empresa', description: error.message });
      else setConfig(data || {});
      setLoading(false);
    });
  }, [toast]);

  const handleChange = (e) => setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    const values = { razon_social: config.razon_social, rut: config.rut, direccion: config.direccion, email: config.email, telefono: config.telefono, footer_texto: config.footer_texto };
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
      <p className="text-sm text-slate-500 mb-4">Se muestran en el encabezado y pie de los presupuestos a clientes.</p>
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
