/** Server-only Workspace authorization. Refresh credentials never enter browser JS or repository data. */
const COOKIE = '__Host-agenda_workspace';
const MAX_AGE = 180 * 24 * 60 * 60;
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/calendar.events.owned'];
export interface WorkspaceEnv { origin: string; clientId: string; clientSecret: string; cookieKey: string; supabaseUrl: string; supabaseKey: string }
interface Grant { v: 1; userId: string; email: string; refreshToken: string; scope: string; expires: number }
class WorkspaceError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
async function encryptionKey(config: WorkspaceEnv) {
  const key = unb64(config.cookieKey);
  if (key.length !== 32) throw new WorkspaceError(503, 'setup_required', 'Falta configurar la conexión persistente de Google.');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptGrant(value: Grant, config: WorkspaceEnv): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(COOKIE + config.origin) }, await encryptionKey(config), new TextEncoder().encode(JSON.stringify(value)));
  return b64(iv) + '.' + b64(new Uint8Array(data));
}
async function readGrant(request: Request, config: WorkspaceEnv, userId: string): Promise<Grant | null> {
  const value = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value) return null;
  try {
    const [iv, ciphertext, extra] = value.split('.');
    if (!iv || !ciphertext || extra) return null;
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(COOKIE + config.origin) }, await encryptionKey(config), unb64(ciphertext));
    const grant = JSON.parse(new TextDecoder().decode(bytes)) as Grant;
    if (grant.v !== 1 || grant.userId !== userId || grant.expires <= Date.now() || !grant.refreshToken || !grant.email || !SCOPES.every(scope => grant.scope.split(' ').includes(scope))) return null;
    return grant;
  } catch { return null; }
}
function cookie(value: string, age = MAX_AGE) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
function reply(data: unknown, status = 200, setCookie?: string) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) } });
}
async function userFrom(request: Request, config: WorkspaceEnv, fetcher: typeof fetch) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) throw new WorkspaceError(401, 'unauthorized', 'Ingresá a Agenda para continuar.');
  const headers = { authorization, apikey: config.supabaseKey };
  const response = await fetcher(config.supabaseUrl + '/auth/v1/user', { headers });
  if (!response.ok) throw new WorkspaceError(401, 'unauthorized', 'La sesión de Agenda venció. Volvé a ingresar.');
  const user = await response.json() as { id?: string; email?: string };
  if (!user.id || !user.email?.toLowerCase().endsWith('@amautainversiones.com')) throw new WorkspaceError(403, 'forbidden', 'Usá tu cuenta laboral autorizada.');
  const access = await fetcher(config.supabaseUrl + '/rest/v1/agenda_access?' + new URLSearchParams({ select: 'email,role', email: 'eq.' + user.email.toLowerCase(), active: 'eq.true' }), { headers });
  if (!access.ok) throw new WorkspaceError(503, 'unavailable', 'No se pudo comprobar el acceso a Agenda.');
  const rows = await access.json() as { email: string; role: string }[];
  if (!rows.some(row => row.email.toLowerCase() === user.email!.toLowerCase() && row.role === 'owner')) throw new WorkspaceError(403, 'forbidden', 'Esta cuenta no tiene acceso a la conexión de Workspace.');
  return { id: user.id, email: user.email.toLowerCase() };
}
async function tokens(params: Record<string, string>, config: WorkspaceEnv, fetcher: typeof fetch) {
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }) });
  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!response.ok || !body.access_token) {
    if (body.error === 'invalid_grant') throw new WorkspaceError(409, 'reconnect_required', 'Google revocó o venció la autorización. Volvé a conectar Workspace.');
    throw new WorkspaceError(502, 'google_unavailable', 'Google no pudo renovar la conexión. Intentá de nuevo.');
  }
  if (body.scope && !SCOPES.every(scope => body.scope!.split(' ').includes(scope))) throw new WorkspaceError(409, 'reconnect_required', 'Faltan permisos de Drive, Gmail o Calendar. Volvé a conectar Workspace.');
  return body;
}
async function googleEmail(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: 'Bearer ' + accessToken } });
  if (!response.ok) throw new WorkspaceError(502, 'google_unavailable', 'No se pudo verificar la cuenta de Google.');
  const user = await response.json() as { email?: string; email_verified?: boolean; hd?: string };
  if (!user.email_verified || user.hd !== 'amautainversiones.com' || !user.email?.toLowerCase().endsWith('@amautainversiones.com')) throw new WorkspaceError(403, 'wrong_account', 'Conectá tu cuenta laboral de Amauta.');
  return user.email.toLowerCase();
}
export async function handleWorkspace(request: Request, config: WorkspaceEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  try {
    if (request.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
    if (request.headers.get('origin') !== config.origin || new URL(request.url).origin !== config.origin || request.headers.get('x-agenda-workspace') !== '1') throw new WorkspaceError(403, 'forbidden', 'Origen de la solicitud no permitido.');
    if (!config.clientSecret || !config.cookieKey || !config.clientId || !config.supabaseUrl || !config.supabaseKey) throw new WorkspaceError(503, 'setup_required', 'Falta configurar la conexión persistente de Google.');
    const user = await userFrom(request, config, fetcher);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WorkspaceError(400, 'invalid_request', 'Formato no permitido.');
    const text = await request.text();
    if (text.length > 10000) throw new WorkspaceError(400, 'invalid_request', 'Solicitud demasiado grande.');
    let input: { action?: string; code?: string };
    try { input = JSON.parse(text); } catch { throw new WorkspaceError(400, 'invalid_request', 'Solicitud inválida.'); }
    if (!input || typeof input !== 'object') throw new WorkspaceError(400, 'invalid_request', 'Solicitud inválida.');
    if (input.action === 'disconnect') return reply({ connected: false }, 200, cookie('', 0));
    const old = await readGrant(request, config, user.id);
    if (input.action === 'restore' && !old) return reply({ connected: false });
    if (input.action !== 'connect' && input.action !== 'restore') throw new WorkspaceError(400, 'invalid_request', 'Acción no permitida.');
    if (input.action === 'connect' && (typeof input.code !== 'string' || input.code.length < 10 || input.code.length > 4000)) throw new WorkspaceError(400, 'invalid_request', 'Código de autorización inválido.');
    const result = await tokens(input.action === 'connect' ? { code: input.code!, grant_type: 'authorization_code', redirect_uri: config.origin } : { refresh_token: old!.refreshToken, grant_type: 'refresh_token' }, config, fetcher);
    const email = await googleEmail(result.access_token!, fetcher);
    if (email !== user.email || old && input.action === 'restore' && email !== old.email) throw new WorkspaceError(403, 'wrong_account', 'Conectá la misma cuenta laboral con la que ingresaste a Agenda.');
    const refreshToken = result.refresh_token || (old?.email === email ? old.refreshToken : '');
    if (!refreshToken) throw new WorkspaceError(409, 'reconnect_required', 'Google no entregó una autorización renovable. Volvé a conectar y autorizá el acceso.');
    const grant: Grant = { v: 1, userId: user.id, email, refreshToken, scope: result.scope || old?.scope || SCOPES.join(' '), expires: Date.now() + MAX_AGE * 1000 };
    return reply({ connected: true, email, accessToken: result.access_token, expiresAt: Date.now() + Math.max(60, Math.min(Number(result.expires_in) || 3600, 7200)) * 1000 }, 200, cookie(await encryptGrant(grant, config)));
  } catch (error) {
    if (error instanceof WorkspaceError) return reply({ error: error.message, code: error.code }, error.status, error.code === 'reconnect_required' ? cookie('', 0) : undefined);
    return reply({ error: 'No se pudo recuperar la conexión de Google. Intentá de nuevo.', code: 'unavailable' }, 503);
  }
}
export function workspaceEnv(): WorkspaceEnv {
  return { origin: process.env['GOOGLE_WORKSPACE_ORIGIN'] || 'https://agenda-amauta.vercel.app', clientId: process.env['VITE_GOOGLE_CLIENT_ID'] || '', clientSecret: process.env['GOOGLE_WORKSPACE_CLIENT_SECRET'] || '', cookieKey: process.env['GOOGLE_WORKSPACE_COOKIE_KEY'] || '', supabaseUrl: process.env['VITE_SUPABASE_URL'] || '', supabaseKey: process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || '' };
}
