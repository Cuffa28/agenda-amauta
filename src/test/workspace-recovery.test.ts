import { afterEach, describe, expect, it, vi } from 'vitest';
import { disconnectGoogle, googleSnapshot, restoreGoogle } from '@/integrations/google/workspace';
const session = {access_token:'synthetic-session',user:{id:'user-one',email:'facundo@amautainversiones.com'}};
vi.mock('@/data/supabase/client',()=>({getSupabase:()=>({auth:{getSession:async()=>({data:{session},error:null})}}),requireAgendaSession:async()=>({user:session.user})}));
afterEach(()=>{disconnectGoogle();vi.unstubAllGlobals();});
describe('Recuperación de Workspace al reabrir',()=>{
  it('recupera automáticamente desde el servidor sin abrir Google ni guardar credenciales en localStorage',async()=>{
    disconnectGoogle();localStorage.clear();
    const fetcher=vi.fn().mockResolvedValue(Response.json({connected:true,email:session.user.email,accessToken:'synthetic-access',expiresAt:Date.now()+3600000}));
    vi.stubGlobal('fetch',fetcher);
    await restoreGoogle();
    expect(googleSnapshot().email).toBe(session.user.email);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/google-workspace');
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({action:'restore'});
    expect(localStorage.length).toBe(0);
  });
  it('no reinstala una autorización si se cerró o cambió la sesión mientras llegaba la respuesta',async()=>{
    disconnectGoogle();
    let complete!:(response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(resolve=>{complete=resolve;})));
    const pending=restoreGoogle();
    await vi.waitFor(()=>expect(complete).toBeTypeOf('function'));
    disconnectGoogle();
    complete(Response.json({connected:true,email:session.user.email,accessToken:'synthetic-access',expiresAt:Date.now()+3600000}));
    await pending;
    expect(googleSnapshot().email).toBe('');expect(googleSnapshot().expiresAt).toBe(0);
  });
});
