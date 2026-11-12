/** ID estable para evitar duplicaciones en creaciones concurrentes del mismo registro lógico. */
export async function stableUuid(key:string):Promise<string>{
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))).slice(0,16);bytes[6]=(bytes[6]!&15)|128;bytes[8]=(bytes[8]!&63)|128;
 const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
