import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, requireAgendaSession } from '@/data/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false), [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(''), [email, setEmail] = useState(''), [busy, setBusy] = useState(false);
  const demo = import.meta.env['VITE_AGENDA_MODE'] === 'demo';
  const googleEnabled = import.meta.env['VITE_GOOGLE_AUTH_ENABLED'] === 'true';
  useEffect(() => {
    if (demo) return;
    try {
      const sb = getSupabase();
      void sb.auth.getSession().then(({ data, error }) => { if (error) setError(error.message); setSession(data.session); setLoaded(true); });
      const { data } = sb.auth.onAuthStateChange((event, s) => { if (event === 'SIGNED_OUT') { queryClient.clear(); setAllowed(false); } setSession(s); setLoaded(true); });
      return () => data.subscription.unsubscribe();
    } catch (e) { setError((e as Error).message); setLoaded(true); }
    return undefined;
  }, [demo, queryClient]);
  useEffect(() => {
    if (!session) { setAllowed(false); return; }
    let active = true;
    void requireAgendaSession().then(() => { if (active) setAllowed(true); }).catch(e => { if (active) { setAllowed(false); setError(e.message); } });
    return () => { active = false; };
  }, [session]);
  async function login(method: 'google' | 'email') {
    setBusy(true); setError('');
    try {
      const sb = getSupabase();
      if (method === 'google') {
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } } });
        if (error) throw error;
      } else {
        if (!email.trim()) throw new Error('Ingresá tu correo autorizado.');
        const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin } });
        if (error) throw error; setError('Revisá tu correo para abrir el enlace de acceso.');
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (demo) return <>{children}</>;
  if (session && allowed) return <><div className="flex items-center justify-end gap-4 border-b bg-card p-2 text-xs"><span>{session.user.email}</span><Button variant="ghost" size="sm" onClick={() => void getSupabase().auth.signOut()}>Cerrar sesión</Button></div><Suspense fallback={<p className="p-8">Cargando agenda…</p>}>{children}</Suspense></>;
  return <div className="grid min-h-screen place-items-center bg-background p-6"><section className="surface-card w-full max-w-md space-y-5 p-8"><h1 className="text-2xl font-semibold">Agenda Amauta</h1><p className="text-sm text-muted-foreground">Ingresá con tu cuenta autorizada para acceder a las carteras.</p>{!loaded ? <p>Comprobando sesión…</p> : <><Button className="w-full" disabled={busy || !googleEnabled} onClick={() => void login('google')}>Ingresar con Google</Button>{!googleEnabled && <p className="text-xs text-muted-foreground">Google está pendiente de configurar. Podés solicitar acceso por correo.</p>}<form className="space-y-3" onSubmit={e => { e.preventDefault(); void login('email'); }}><label className="text-sm" htmlFor="login-email">Correo autorizado</label><Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/><Button className="w-full" variant="outline" disabled={busy}>Recibir enlace de acceso</Button></form>{session && <Button variant="ghost" onClick={() => void getSupabase().auth.signOut()}>Cambiar cuenta</Button>}</>}{error && <p role="status" className="text-sm">{error}</p>}</section></div>;
}
