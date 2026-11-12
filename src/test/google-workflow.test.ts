import {describe,expect,it} from 'vitest';
import {calendarBody,draftRaw,googleRequest} from '@/integrations/google/workspace';
import {arNumber,parseBalanz} from '@/domain/import/balanz';
import {emptyPlan,rotationTotals} from '@/domain/rotation';
import type {Position} from '@/domain/schemas';
const position:Position={id:'p',clientId:'00123-00',alyc:'Broker',cutoffDate:'2026-11-12',drivePdf:null,declaredTotals:[],items:[{id:'ars',instrument:'Instrumento en pesos',ticker:'AAA',currency:'ARS',quantity:10,price:100,marketValue:1000},{id:'usd',instrument:'Instrumento en dólares',ticker:'BBB',currency:'USD',quantity:5,price:100,marketValue:500}]};
describe('Google Workspace y planificación',()=>{
 it('crea MIME de borrador preservando acentos y bloquea inyección de destinatarios',()=>{
  const raw=draftRaw('advisor@example.com','Revisión de cartera','Propuesta: reducir concentración argentina.');
  const decoded=new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
  expect(decoded).toContain('To: advisor@example.com\r\n');expect(decoded).toContain('Content-Type: text/plain; charset=UTF-8');
  expect(()=>draftRaw('a@example.com\r\nBcc:other@example.com','Asunto','Mensaje')).toThrow();
  expect(()=>draftRaw('advisor@example.com','Asunto\r\nBcc:other@example.com','Mensaje')).toThrow();
 });
 it('no habilita endpoints de envío ni destinos externos aunque alguien los invoque',async()=>{
  await expect(googleRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST'})).rejects.toThrow('no está habilitada');
  await expect(googleRequest('https://attacker.example.com/')).rejects.toThrow('no permitido');
 });
 it('agenda en Buenos Aires sin invitados y calcula correctamente el cambio de día',()=>{
  const event=calendarBody({key:'task-1',title:'Revisión',date:'2026-11-12',time:'23:30',durationMinutes:90,description:'Carteras elegidas'},'id-1');
  expect(event.start.dateTime).toBe('2026-11-13T02:30:00.000Z');expect(event.end.dateTime).toBe('2026-11-13T04:00:00.000Z');
  expect(event).not.toHaveProperty('attendees');expect(event.visibility).toBe('private');
  expect(()=>calendarBody({key:'x',title:'Revisión',date:'2026-02-31',time:'10:00',durationMinutes:30,description:''},'x')).toThrow();
 });
 it('calcula ventas parciales y compras sin mezclar ARS y USD',()=>{
  const plan=emptyPlan();plan.sales={ars:50,usd:20};plan.cash={ARS:100,USD:20};plan.buys=[{name:'Nueva opción',currency:'ARS',amount:550},{name:'Otra opción',currency:'USD',amount:150}];
  const total=rotationTotals(position,plan);expect(total.ARS.remaining).toBe(50);expect(total.USD.remaining).toBe(-30);
  expect(()=>rotationTotals(position,{...plan,sales:{ars:101}})).toThrow();
 });
 it('rechaza planes que se refieren a una posición distinta',()=>{
  expect(()=>rotationTotals(position,{...emptyPlan(),sales:{missing:100}})).toThrow('posición cambió');
 });
 it('extrae cantidades e importes argentinos y conserva una diferencia de conciliación',()=>{
  const text='BALANZ\nPosición consolidada por concertación\nFecha resumen 12/11/2026\nTotal $ 2.550\nPesos $ 100,00\nDólares USD 2,00\nMEP $ 1.000,00\nAAA BONO DE PRUEBA 10,00 0.00 $ 40,00 $ 400';
  const parsed=parseBalanz(text);expect(parsed.items).toHaveLength(3);expect(parsed.items[0]?.quantity).toBe(10);expect(parsed.items[2]?.marketValue).toBe(2000);expect(parsed.difference).toBe(50);
  expect(parsed.sourceNote).toContain('conversión calculada');expect(arNumber('600.357.877')).toBe(600357877);
  expect(()=>parseBalanz('No es un resumen de posiciones')).toThrow();expect(()=>arNumber('1,2,3')).toThrow();
 });
});
