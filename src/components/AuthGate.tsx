import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, requireAgendaSession } from '@/data/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function loginError(error: unknown): string {
  const detail = error as { code?: string; message?: string };
  if (detail.code === 'invalid_credentials') return 'El correo o la contraseña no son correctos. Usá la contraseña de tu cuenta en Amauta, no la de Google.';
  if (detail.code === 'email_not_confirmed') return 'Primero tenés que confirmar tu correo para ingresar.';
  if (detail.code === 'otp_expired' || detail.code === 'flow_state_not_found' || detail.code === 'bad_code_verifier') return 'El enlace de acceso venció o se abrió en otro navegador. Podés ingresar con tu contraseña.';
  return detail.message || 'No pudimos completar el ingreso. Intentá de nuevo.';
}

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false), [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const demo = import.meta.env['VITE_AGENDA_MODE'] === 'demo';
  const googleEnabled = import.meta.env['VITE_GOOGLE_AUTH_ENABLED'] === 'true';
  const emailLinkEnabled = import.meta.env['VITE_EMAIL_LINK_ENABLED'] === 'true';

  useEffect(() => {
    if (demo) return;
    let active = true;
    try {
      const sb = getSupabase();
      void sb.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setError(loginError(error));
        setSession(data.session); setLoaded(true);
      }).catch(e => { if (active) { setError(loginError(e)); setLoaded(true); } });
      const { data } = sb.auth.onAuthStateChange((event, s) => {
        if (!active) return;
        if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { queryClient.clear(); setAllowed(false); }
        setSession(s); setLoaded(true);
      });
      return () => { active = false; data.subscription.unsubscribe(); };
    } catch (e) { setError(loginError(e)); setLoaded(true); }
    return () => { active = false; };
  }, [demo, queryClient]);

  useEffect(() => {
    setAllowed(false);
    if (!session) return;
    let active = true;
    void requireAgendaSession().then(() => {
      if (active) { setAllowed(true); setError(''); }
    }).catch(e => { if (active) { setAllowed(false); setError(loginError(e)); } });
    return () => { active = false; };
  }, [session]);

  async function login(method: 'google' | 'email' | 'password') {
    setBusy(true); setError(''); setNotice('');
    try {
      const sb = getSupabase();
      if (method === 'google') {
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } } });
        if (error) throw error;
      } else if (method === 'password') {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
        setSession(data.session);
      } else {
        const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setNotice('Revisá tu correo y abrí el enlace en este mismo navegador.');
      }
    } catch (e) { setError(loginError(e)); }
    finally { setPassword(''); setBusy(false); }
  }

  if (demo) return <>{children}</>;
  if (session && allowed) return <><div className="flex items-center justify-end gap-4 border-b bg-card p-2 text-xs"><span>{session.user.email}</span><Button variant="ghost" size="sm" onClick={() => void getSupabase().auth.signOut()}>Cerrar sesión</Button></div><Suspense fallback={<p className="p-8">Cargando agenda…</p>}>{children}</Suspense></>;
  return <div className="grid min-h-screen place-items-center bg-background p-6"><section className="surface-card w-full max-w-md space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Agenda Amauta</h1>
    <p className="text-sm text-muted-foreground">Ingresá con tu cuenta autorizada de Amauta.</p>
    {!loaded ? <p>Comprobando sesión…</p> : session && !error ? <p role="status">Comprobando acceso…</p> : <>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void login('password'); }}>
        <label className="text-sm" htmlFor="login-email">Correo</label>
        <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" disabled={busy}/>
        <label className="text-sm" htmlFor="login-password">Contraseña</label>
        <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" disabled={busy}/>
        <p className="text-xs text-muted-foreground">Usá la misma cuenta y contraseña que ya utilizás en el CRM de Amauta.</p>
        <Button className="w-full" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>
      </form>
      {googleEnabled && <Button className="w-full" variant="outline" disabled={busy} onClick={() => void login('google')}>Ingresar con Google</Button>}
      {emailLinkEnabled && <Button className="w-full" variant="outline" disabled={busy || !email.trim()} onClick={() => void login('email')}>Recibir enlace de acceso</Button>}
      {session && <Button variant="ghost" onClick={() => void getSupabase().auth.signOut()}>Cambiar cuenta</Button>}
    </>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section></div>;
}
