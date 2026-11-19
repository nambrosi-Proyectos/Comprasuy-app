import React, { useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { motion } from 'framer-motion';
import { authApi } from '@/lib/customSupabaseClient';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, AtSign } from 'lucide-react';

const resetToken = () => new URLSearchParams(window.location.search).get('token') || '';

const LoginView = () => {
  const { signIn, mailConfigured, finishPasswordRecovery } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState(window.location.pathname === '/reset-password' ? 'reset' : 'login');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const goToLogin = () => {
    if (window.location.pathname === '/reset-password') window.history.replaceState({}, '', '/');
    finishPasswordRecovery();
    setMode('login');
  };

  const handleRecovery = async (e) => {
    e.preventDefault();
    setMessage('');
    setErrorMessage('');
    if (mode === 'reset' && password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const { error } = await authApi.forgot(email.trim());
        if (error) throw error;
        setMessage('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de correo no deseado.');
      } else {
        const token = resetToken();
        if (!token) throw new Error('Abre el enlace de recuperación enviado a tu correo. Si venció, solicita uno nuevo.');
        const { error } = await authApi.reset(token, password);
        if (error) throw error;
        setPassword('');
        setConfirmation('');
        window.history.replaceState({}, '', '/');
        setMessage('Tu contraseña se actualizó correctamente. Ya puedes volver al inicio de sesión.');
      }
    } catch (error) {
      setErrorMessage(error.message || (mode === 'forgot'
        ? 'No se pudo enviar el enlace. Verifica el correo e inténtalo nuevamente más tarde.'
        : 'No se pudo actualizar la contraseña. Solicita un enlace nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    await signIn(email.trim(), password);
    setLoading(false);
  };

  const toggleMode = () => {
    setMessage('');
    setErrorMessage('');
    setPassword('');
    if (mode === 'login') setMode('forgot');
    else goToLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-5">
      <Helmet><title>Acceso y recuperación de contraseña - Comprasuy</title><meta name="description" content="Accede a Comprasuy o recupera tu contraseña mediante un enlace seguro enviado a tu correo." /></Helmet>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[380px] bg-white p-[30px] rounded-2xl"
      >
        <div className="text-center mb-7">
          <img src="/logo-comprasuy.webp" alt="Comprasuy" className="h-12 mx-auto mb-5" />
          <h1 className="text-[26px] leading-tight font-extrabold text-ink mb-1">{mode === 'login' ? 'Bienvenido a Comprasuy' : mode === 'forgot' ? 'Recuperar contraseña' : 'Nueva contraseña'}</h1>
          <p className="text-slate-500">{mode === 'login' ? 'Inicia sesión para acceder al portal' : mode === 'forgot' ? 'Te enviaremos un enlace seguro a tu correo.' : 'Elige una contraseña de al menos 8 caracteres.'}</p>
        </div>

        {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
        {errorMessage && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-red-800">{errorMessage}</p>}
        {mode === 'forgot' && !mailConfigured && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-800 text-sm">
            El envío de correos todavía no está configurado. Pedile a un administrador que te asigne una contraseña nueva desde Configuración → Usuarios.
          </p>
        )}
        <form onSubmit={mode === 'login' ? handleLogin : handleRecovery} className="space-y-6">
          {mode !== 'reset' && <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>}
          {mode !== 'forgot' && <div className="space-y-2">
            <Label htmlFor="password">{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                minLength={mode === 'reset' ? 8 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>}
          {mode === 'reset' && <div className="space-y-2"><Label htmlFor="confirmation">Confirmar contraseña</Label><Input id="confirmation" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div>}
          <Button type="submit" className="w-full h-12 text-base" disabled={loading || (mode === 'forgot' && !mailConfigured)}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Procesando...' : mode === 'login' ? 'Ingresar' : mode === 'forgot' ? 'Enviar enlace de recuperación' : 'Guardar nueva contraseña'}
          </Button>
        </form>
        <button type="button" disabled={loading} className="mt-4 min-h-[44px] w-full text-sm font-semibold text-brand-dark hover:underline" onClick={toggleMode}>
          {mode === 'login' ? '¿Olvidaste tu contraseña?' : 'Volver al inicio de sesión'}
        </button>
      </motion.div>
    </div>
  );
};

export default LoginView;
