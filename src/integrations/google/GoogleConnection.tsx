import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabase } from '@/data/supabase/client';
import { connectGoogle, disconnectGoogle, googleConfig, googleSnapshot, saveGoogleConfig, subscribeGoogle, loadScript } from './workspace';
export function useGoogleWorkspace() {
  const state = useSyncExternalStore(subscribeGoogle, googleSnapshot, googleSnapshot);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  return { ...state, connected: !!state.email && state.expiresAt > now + 5000 };
}
export function GoogleSessionGuard() {
  useEffect(() => { try { const { data } = getSupabase().auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') disconnectGoogle(); }); return () => data.subscription.unsubscribe(); } catch { return undefined; } }, []);
  return null;
}
export function GoogleConnection({ showSetup = false }: { showSetup?: boolean }) {
  const google = useGoogleWorkspace();
  const [config, setConfig] = useState(googleConfig), [error, setError] = useState('');
  useEffect(()=>{if(config.clientId)void loadScript('https://accounts.google.com/gsi/client').catch(()=>{});},[config.clientId]);
  return <div className="connection-card mb-5 space-y-3 p-5">
    <p className="font-medium">Google Workspace · {google.connected ? google.email : 'Sin conexión activa'}</p>
    <p className="text-sm text-muted-foreground">Drive: archivos que selecciones. Gmail: borradores. Calendar: eventos en tu calendario laboral, sin invitados. La conexión se renueva cuando Google la solicite.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={google.busy || !config.clientId} onClick={() => { setError(''); void connectGoogle().catch(e => setError(e.message)); }}>{google.busy ? 'Conectando…' : google.connected ? 'Cambiar cuenta de Google' : 'Conectar Google Workspace'}</Button>{google.email && <Button type="button" variant="outline" onClick={disconnectGoogle}>Desconectar esta sesión</Button>}</div>
    {!config.clientId && <p className="text-sm">Falta configurar el proyecto de Google en Configuración.</p>}
    {(error || google.error) && <p role="alert" className="text-sm text-destructive">{error || google.error}</p>}
    {showSetup && <details><summary className="cursor-pointer text-sm">Configuración inicial del proyecto de Google</summary><form className="mt-3 grid gap-3" onSubmit={e => { e.preventDefault(); try { saveGoogleConfig(config); setError(''); } catch (e) { setError((e as Error).message); } }}>
      <p className="text-xs text-muted-foreground">Usá un cliente OAuth web autorizado para https://agenda-amauta.vercel.app. Estos valores son la configuración pública para navegador. No ingreses un Client Secret. Los valores ingresados aquí quedan en este navegador; las variables de publicación permiten usarlos desde todas tus PCs.</p>
      <label>Client ID OAuth web<Input value={config.clientId} onChange={e => setConfig({ ...config, clientId: e.target.value.trim() })} required/></label>
      <label>Número del proyecto de Google<Input value={config.projectNumber} onChange={e => setConfig({ ...config, projectNumber: e.target.value.trim() })}/></label>
      <label>Clave pública del selector de Drive<Input value={config.pickerKey} onChange={e => setConfig({ ...config, pickerKey: e.target.value.trim() })}/></label>
      <a className="text-sm underline" href="https://github.com/Cuffa28/agenda-amauta/blob/main/GOOGLE_WORKSPACE.md" target="_blank" rel="noopener noreferrer">Ver guía de configuración de Google Workspace</a>
      <p className="text-xs">Restringí la clave del selector al sitio de Agenda y docs.google.com, y a Google Picker API y Google Drive API. Habilitá Drive API, Gmail API, Calendar API y Google Picker API en el mismo proyecto.</p><Button type="submit" variant="outline">Guardar configuración pública</Button>
    </form></details>}
  </div>;
}
