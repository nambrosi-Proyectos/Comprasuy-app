import React, { useState } from 'react';
import { authApi } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserCircle } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/roles';

/** Cambio de la contraseña propia. */
const CuentaManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmation) return toast({ variant: 'destructive', title: 'Las contraseñas no coinciden' });
    setSaving(true);
    const { error } = await authApi.changePassword(password);
    setSaving(false);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo cambiar la contraseña', description: error.message });
    setPassword('');
    setConfirmation('');
    toast({ title: '🔑 Contraseña actualizada' });
  };

  return (
    <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-full">
      <h2 className="text-2xl font-semibold mb-1 flex items-center"><UserCircle className="mr-2 h-6 w-6" /> Mi cuenta</h2>
      <p className="text-sm text-slate-500 mb-4">{user?.name ? `${user.name} · ` : ''}{user?.email} · {ROLE_LABELS[user?.role] || user?.role}</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="acc-pass">Nueva contraseña (mínimo 8 caracteres)</Label>
          <Input id="acc-pass" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="acc-confirm">Confirmar contraseña</Label>
          <Input id="acc-confirm" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        </div>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cambiar contraseña</Button>
      </form>
    </div>
  );
};

export default CuentaManagement;
