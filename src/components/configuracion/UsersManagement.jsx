import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Users, UserPlus, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

import { ROLE_LABELS } from '@/lib/roles';
const emptyForm = { name: '', email: '', role: 'usuario', password: '' };

const UsersManagement = () => {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminApi.listUsers();
    if (error) toast({ variant: 'destructive', title: 'Error al cargar usuarios', description: error.message });
    else setUsers(data);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await adminApi.createUser(form);
    setSaving(false);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo crear el usuario', description: error.message });
    toast({ title: '✅ Usuario creado', description: `${form.email} ya puede iniciar sesión.` });
    setForm(emptyForm);
    setIsCreateOpen(false);
    load();
  };

  const handleRoleChange = async (target, role) => {
    const { error } = await adminApi.updateUser(target.id, { role });
    if (error) return toast({ variant: 'destructive', title: 'No se pudo cambiar el rol', description: error.message });
    toast({ title: '✅ Rol actualizado' });
    load();
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await adminApi.updateUser(passwordTarget.id, { password: newPassword });
    setSaving(false);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo cambiar la contraseña', description: error.message });
    toast({ title: '🔑 Contraseña actualizada', description: `Comunicale la nueva contraseña a ${passwordTarget.email}.` });
    setPasswordTarget(null);
    setNewPassword('');
  };

  const handleDelete = async () => {
    const { error } = await adminApi.deleteUser(deleteTarget.id);
    setDeleteTarget(null);
    if (error) return toast({ variant: 'destructive', title: 'No se pudo borrar', description: error.message });
    toast({ title: '🗑️ Usuario eliminado' });
    load();
  };

  return (
    <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-semibold flex items-center"><Users className="mr-2 h-6 w-6" /> Usuarios</h2>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Correo</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {u.name || '—'} {u.id === me?.id && <Badge variant="secondary" className="ml-1">Vos</Badge>}
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Rol de ${u.email}`}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setPasswordTarget(u); setNewPassword(''); }}>
                        <KeyRound className="h-4 w-4 mr-1" /> Contraseña
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Borrar ${u.email}`} disabled={u.id === me?.id} onClick={() => setDeleteTarget(u)} className="text-slate-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500 flex items-center"><ShieldCheck className="h-4 w-4 mr-1" /> Los administradores pueden gestionar usuarios. Cada usuario ve solo sus oportunidades guardadas.</p>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
              <DialogDescription>La persona entra con este correo y contraseña.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1"><Label htmlFor="nu-name">Nombre</Label><Input id="nu-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="nu-email">Correo</Label><Input id="nu-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1">
                <Label htmlFor="nu-role">Rol</Label>
                <select id="nu-role" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="nu-pass">Contraseña (mínimo 8 caracteres)</Label><Input id="nu-pass" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear usuario</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent>
          <form onSubmit={handlePassword}>
            <DialogHeader>
              <DialogTitle>Nueva contraseña</DialogTitle>
              <DialogDescription>{passwordTarget?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1 py-4">
              <Label htmlFor="np-pass">Contraseña (mínimo 8 caracteres)</Label>
              <Input id="np-pass" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar a {deleteTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>La persona ya no podrá iniciar sesión. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className={buttonVariants({ variant: 'destructive' })}>Sí, borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersManagement;
