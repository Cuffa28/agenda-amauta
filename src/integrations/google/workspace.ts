import { isRealDate } from '@/domain/dates';
import { requireAgendaSession } from '@/data/supabase/client';

export const GOOGLE_SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive.file',
  gmail: 'https://www.googleapis.com/auth/gmail.compose',
  calendar: 'https://www.googleapis.com/auth/calendar.events.owned',
} as const;
export interface GoogleConfig { clientId: string; pickerKey: string; projectNumber: string }
export interface GoogleState { email: string; expiresAt: number; busy: boolean; error: string }
interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
type TokenClient = { requestAccessToken: (options: { prompt: string; hint?: string }) => void };
type GoogleGlobal = { accounts: { oauth2: { initTokenClient: (options: Record<string, unknown>) => TokenClient } }; picker?: any };
declare global { interface Window { google?: GoogleGlobal; gapi?: { load: (name: string, options: { callback: () => void; onerror: () => void }) => void } } }

let token = '', ownerId = '';
let state: GoogleState = { email: '', expiresAt: 0, busy: false, error: '' };
const listeners = new Set<() => void>();
const scripts = new Map<string, Promise<void>>();
export const subscribeGoogle = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const googleSnapshot = () => state;
function emit(patch: Partial<GoogleState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
export function googleConfig(): GoogleConfig {
  let local: Partial<GoogleConfig> = {};
  try { local = JSON.parse(localStorage.getItem('agenda.google.public-config') || '{}'); } catch { /* Valores públicos opcionales. */ }
  return { clientId: import.meta.env['VITE_GOOGLE_CLIENT_ID'] || local.clientId || '', pickerKey: import.meta.env['VITE_GOOGLE_PICKER_KEY'] || local.pickerKey || '', projectNumber: import.meta.env['VITE_GOOGLE_PROJECT_NUMBER'] || local.projectNumber || '' };
}
export function saveGoogleConfig(config: GoogleConfig) {
  if (!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(config.clientId)) throw Error('El Client ID de Google no es válido. Usá un cliente OAuth de aplicación web.');
  if (config.projectNumber && !/^\d+$/.test(config.projectNumber)) throw Error('El número de proyecto debe contener solo dígitos.');
  localStorage.setItem('agenda.google.public-config', JSON.stringify(config)); disconnectGoogle();
}
export function disconnectGoogle() { token = ''; ownerId = ''; emit({ email: '', expiresAt: 0, busy: false, error: '' }); }
export function loadScript(url: string): Promise<void> {
  if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = url; el.async = true;
    el.onload = () => resolve(); el.onerror = () => { scripts.delete(url); el.remove(); reject(Error('No se pudo cargar Google. Revisá la conexión o el bloqueo de ventanas.')); }; document.head.appendChild(el);
  }));
  return scripts.get(url)!;
}
export async function connectGoogle(): Promise<void> {
  if (state.busy) return;
  const config = googleConfig();
  if (!config.clientId) throw Error('Falta configurar el proyecto de Google en Configuración.');
  const { user } = await requireAgendaSession();
  emit({ busy: true, error: '' });
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({ client_id: config.clientId, scope: ['openid', 'email', 'profile', ...Object.values(GOOGLE_SCOPES)].join(' '), include_granted_scopes: true, callback: resolve, error_callback: () => reject(Error('Google no completó la conexión. Permití las ventanas emergentes e intentá de nuevo.')) });
      client.requestAccessToken({ prompt: 'select_account', ...(user.email?.endsWith('@amautainversiones.com') ? { hint: user.email } : {}) });
    });
    if (!response.access_token || response.error) throw Error(response.error_description || 'No se autorizaron los permisos de Google.');
    const granted = new Set((response.scope || '').split(' '));
    if (Object.values(GOOGLE_SCOPES).some(scope => !granted.has(scope))) throw Error('Falta autorizar alguno de los servicios: Drive, Gmail y Calendar. Volvé a conectar y revisá los permisos.');
    const infoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${response.access_token}` } });
    if (!infoResponse.ok) throw Error('Google no permitió comprobar la cuenta conectada.');
    const info = await infoResponse.json();
    if (user.email?.endsWith('@amautainversiones.com') && String(info.email).toLowerCase() !== user.email.toLowerCase()) throw Error('Conectá la misma cuenta laboral con la que ingresaste a Agenda.');
    if (!info.email_verified || info.hd !== 'amautainversiones.com' || !String(info.email).toLowerCase().endsWith('@amautainversiones.com')) throw Error('Conectá tu cuenta laboral @amautainversiones.com.');
    token = response.access_token; ownerId = user.id;
    emit({ email: String(info.email).toLowerCase(), expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000, busy: false });
  } catch (error) { token = ''; ownerId = ''; emit({ email: '', expiresAt: 0, busy: false, error: (error as Error).message }); throw error; }
}
async function accessToken() {
  const { user } = await requireAgendaSession();
  if (!token || ownerId !== user.id || state.expiresAt <= Date.now() + 5000) { disconnectGoogle(); throw Error('Conectá Google Workspace para continuar. La autorización de esta sesión venció o no está activa.'); }
  return token;
}
export class GoogleApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function googleRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  // Solo APIs oficiales declaradas: evita transmitir la autorización a destinos arbitrarios.
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.googleapis.com', 'gmail.googleapis.com'].includes(parsed.hostname)) throw Error('Destino de Google no permitido.');
  const method=(init.method||'GET').toUpperCase();
  const allowed=parsed.hostname==='gmail.googleapis.com' ? /^\/gmail\/v1\/users\/me\/drafts(?:\/[A-Za-z0-9_-]+)?$/.test(parsed.pathname)&&['GET','POST','PUT'].includes(method) : (/^\/(?:upload\/)?drive\/v3\/files(?:\/[A-Za-z0-9_-]+)?$/.test(parsed.pathname)||/^\/calendar\/v3\/calendars\/primary\/events(?:\/[A-Za-z0-9_-]+)?$/.test(parsed.pathname))&&['GET','POST'].includes(method);
  if(!allowed)throw Error('Esta acción Google no está habilitada en Agenda.');
  const access = await accessToken();
  let response: Response;
  try { response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${access}` } }); }
  catch { throw Error('No se pudo confirmar la respuesta de Google. Revisá el destino antes de repetir una creación.'); }
  if (response.status === 401) { disconnectGoogle(); throw Error('La sesión de Google venció. Volvé a conectar.'); }
  if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new GoogleApiError(response.status, detail.error?.message || 'Google no pudo completar la operación.'); }
  return response.status === 204 ? undefined as T : response.json();
}

export interface DrivePdf { id: string; name: string; webViewLink: string; mimeType: string }
export async function pickDrivePdf(): Promise<DrivePdf | null> {
  const config = googleConfig(), access = await accessToken();
  if (!config.pickerKey || !config.projectNumber) throw Error('Falta la clave pública del selector o el número de proyecto en Configuración.');
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve, reject) => window.gapi!.load('picker', { callback: resolve, onerror: () => reject(Error('No se pudo abrir el selector de Drive.')) }));
  const picker = window.google!.picker;
  const id = await new Promise<string | null>(resolve => {
    new picker.PickerBuilder().addView(new picker.DocsView(picker.ViewId.DOCS).setMimeTypes('application/pdf')).setOAuthToken(access).setDeveloperKey(config.pickerKey).setAppId(config.projectNumber).setOrigin(window.location.origin).setTitle('Elegir PDF de posiciones').setCallback((data: { action: string; docs?: { id: string }[] }) => {
      if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id || null);
      if (data.action === picker.Action.CANCEL) resolve(null);
    }).build().setVisible(true);
  });
  if (!id) return null;
  const file = await googleRequest<DrivePdf>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`);
  if (file.mimeType !== 'application/pdf') throw Error('Elegí un archivo PDF.'); return file;
}
export async function uploadDrivePdf(file: File): Promise<DrivePdf> {
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 25 * 1024 * 1024) throw Error('Elegí un PDF de hasta 25 MB.');
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: file.name, mimeType: 'application/pdf' })], { type: 'application/json' }));
  form.append('file', file);
  return googleRequest<DrivePdf>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', { method: 'POST', body: form });
}
export async function downloadDrivePdf(id:string):Promise<Blob> {
  const access=await accessToken();
  const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${access}`}});
  if(!response.ok)throw Error('No se pudo leer ese PDF. Elegilo con el selector de Drive para autorizarlo.');
  const blob=await response.blob();if(blob.size>25*1024*1024)throw Error('El PDF supera los 25 MB.');return blob;
}
function base64Utf8(value: string) { return btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join('')); }
export function draftRaw(to: string, subject: string, body: string): string {
  if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(to) || /[\r\n]/.test(subject)) throw Error('Destinatario o asunto inválido.');
  const wrapped = base64Utf8(body).match(/.{1,76}/g)?.join('\r\n') || '';
  return base64Utf8(`To: ${to}\r\nSubject: =?UTF-8?B?${base64Utf8(subject)}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapped}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function saveGmailDraft(input: { to: string; subject: string; body: string; draftId?: string }) {
  const raw = draftRaw(input.to, input.subject, input.body);
  // Esta integración deliberadamente no implementa endpoints de envío.
  return googleRequest<{ id: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/drafts${input.draftId ? '/' + encodeURIComponent(input.draftId) : ''}`, { method: input.draftId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(input.draftId ? { id: input.draftId } : {}), message: { raw } }) });
}
export interface CalendarInput { key: string; title: string; date: string; time: string; durationMinutes: number; description: string }
export function calendarBody(input: CalendarInput, id: string) {
  if (!isRealDate(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480 || !input.title.trim()) throw Error('Revisá fecha, hora, duración y título.');
  const start = new Date(`${input.date}T${input.time}:00-03:00`);
  if (!Number.isFinite(start.getTime())) throw Error('Fecha inválida.');
  return { id, summary: input.title, description: input.description, visibility: 'private', transparency: 'opaque', start: { dateTime: start.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' }, end: { dateTime: new Date(start.getTime() + input.durationMinutes * 60000).toISOString(), timeZone: 'America/Argentina/Buenos_Aires' }, reminders: { useDefault: true }, extendedProperties: { private: { agendaKey: input.key } } };
}
export async function createCalendarEvent(input: CalendarInput) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`agenda-amauta:${state.email}:${input.key}`));
  const id = 'ama' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const body = calendarBody(input, id), url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  try { return await googleRequest<{ id: string; htmlLink: string }>(url + '?sendUpdates=none', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    const event = await googleRequest<{ id: string; htmlLink: string; summary: string; start: { dateTime: string }; end: { dateTime: string }; extendedProperties?: { private?: { agendaKey?: string } } }>(url + '/' + id);
    if (event.extendedProperties?.private?.agendaKey !== input.key || event.summary !== body.summary || Date.parse(event.start.dateTime) !== Date.parse(body.start.dateTime) || Date.parse(event.end.dateTime) !== Date.parse(body.end.dateTime)) throw Error('El evento existente cambió. Revisalo en Calendar antes de crear otro.');
    return event;
  }
}
export async function calendarConflicts(input: CalendarInput): Promise<{ id: string; summary: string }[]> {
  const body = calendarBody(input, 'preview');
  const qs = new URLSearchParams({ timeMin: body.start.dateTime, timeMax: body.end.dateTime, singleEvents: 'true', maxResults: '100' });
  const data = await googleRequest<{ items?: { id: string; summary?: string; transparency?: string; status?: string }[] }>('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + qs);
  return (data.items || []).filter(e => e.status !== 'cancelled' && e.transparency !== 'transparent').map(e => ({ id: e.id, summary: e.summary || 'Ocupado' }));
}
