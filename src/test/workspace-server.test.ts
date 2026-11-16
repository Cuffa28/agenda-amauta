// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleWorkspace, type WorkspaceEnv } from '@/server/google-workspace';
const scopes = ['https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/calendar.events.owned'].join(' ');
const config: WorkspaceEnv = { origin:'https://agenda.example.com',clientId:'example.apps.googleusercontent.com',clientSecret:'synthetic-secret',cookieKey:Buffer.alloc(32,7).toString('base64url'),supabaseUrl:'https://db.example.com',supabaseKey:'public-key' };
function request(action: string, cookie?: string, extra: Record<string,string> = {}, code = 'synthetic-auth-code') {
  return new Request(config.origin+'/api/google-workspace',{method:'POST',headers:{origin:config.origin,'content-type':'application/json','x-agenda-workspace':'1',authorization:'Bearer synthetic-session',...(cookie?{cookie}:{}),...extra},body:JSON.stringify({action,code})});
}
function googleMock(options: {email?:string;googleEmail?:string;allowed?:boolean;tokenError?:string;networkError?:boolean;id?:string} = {}) {
  const {email='facundo@amautainversiones.com',allowed=true,tokenError='',networkError=false,id='user-one'} = options;
  const googleEmail = options.googleEmail || email;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target=String(url);
    if(target.endsWith('/auth/v1/user')) return Response.json({id,email});
    if(target.includes('/rest/v1/agenda_access')) return Response.json(allowed?[{email,role:'owner'}]:[]);
    if(target==='https://oauth2.googleapis.com/token') {
      if(networkError)throw Error('network unavailable');
      if(tokenError)return Response.json({error:tokenError},{status:400});
      const body=new URLSearchParams(init?.body as URLSearchParams);
      return Response.json({access_token:'synthetic-access-token',scope:scopes,expires_in:3600,...(body.get('grant_type')==='authorization_code'?{refresh_token:'synthetic-refresh-token'}:{})});
    }
    if(target.endsWith('/oauth2/v3/userinfo'))return Response.json({email:googleEmail,email_verified:true,hd:'amautainversiones.com'});
    throw Error('Unexpected external call');
  }) as typeof fetch;
}
async function connectedCookie() {
  const response=await handleWorkspace(request('connect'),config,googleMock());
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
describe('Autorización persistente de Workspace',()=>{
  it('guarda la autorización cifrada y HttpOnly sin devolver el refresh token',async()=>{
    const response=await handleWorkspace(request('connect'),config,googleMock());
    const body=await response.json();
    expect(body.connected).toBe(true);expect(body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(body)).not.toContain('synthetic-refresh-token');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(response.headers.get('set-cookie')).not.toContain('synthetic-refresh-token');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('recupera la conexión en otra visita y renueva por refresh_token sin otro código',async()=>{
    const cookie=await connectedCookie(), fetcher=googleMock();
    const response=await handleWorkspace(request('restore',cookie),config,fetcher);
    expect((await response.json()).connected).toBe(true);
    const call=vi.mocked(fetcher).mock.calls.find(([url])=>String(url)==='https://oauth2.googleapis.com/token')!;
    const body=new URLSearchParams(call[1]!.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('refresh_token');expect(body.get('refresh_token')).toBe('synthetic-refresh-token');
    expect(body.has('code')).toBe(false);
  });
  it('no usa una autorización de otra cuenta ni una cookie manipulada',async()=>{
    const cookie=await connectedCookie();
    const other=await handleWorkspace(request('restore',cookie),config,googleMock({id:'user-two'}));
    expect(await other.json()).toEqual({connected:false});
    const tampered=await handleWorkspace(request('restore',cookie.replace(/.$/,'!')),config,googleMock());
    expect(await tampered.json()).toEqual({connected:false});
  });
  it('rechaza solicitudes externas, cuentas no autorizadas y cuentas Google distintas',async()=>{
    const external=googleMock();
    expect((await handleWorkspace(request('connect',undefined,{origin:'https://attacker.example'}),config,external)).status).toBe(403);
    expect(external).not.toHaveBeenCalled();
    expect((await handleWorkspace(request('connect'),config,googleMock({allowed:false}))).status).toBe(403);
    expect((await handleWorkspace(request('connect'),config,googleMock({googleEmail:'other@amautainversiones.com'}))).status).toBe(403);
    expect((await handleWorkspace(request('connect',undefined,{authorization:''}),config,googleMock())).status).toBe(401);
  });
  it('sólo elimina la autorización guardada si Google confirma revocación, no por un fallo de red',async()=>{
    const cookie=await connectedCookie();
    const revoked=await handleWorkspace(request('restore',cookie),config,googleMock({tokenError:'invalid_grant'}));
    expect(revoked.status).toBe(409);expect(revoked.headers.get('set-cookie')).toContain('Max-Age=0');
    const unavailable=await handleWorkspace(request('restore',cookie),config,googleMock({networkError:true}));
    expect(unavailable.status).toBe(503);expect(unavailable.headers.has('set-cookie')).toBe(false);
  });
  it('desconecta este navegador sin revocar otras integraciones de Google',async()=>{
    const fetcher=googleMock();
    const response=await handleWorkspace(request('disconnect',await connectedCookie()),config,fetcher);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(vi.mocked(fetcher).mock.calls.some(([url])=>String(url).includes('googleapis.com'))).toBe(false);
  });
});
