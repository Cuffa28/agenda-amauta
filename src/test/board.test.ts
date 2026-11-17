import {describe,it,expect} from 'vitest';
import {boardStage,boardInputSchema,type BoardEntry} from '@/domain/board';
import {portfolioMonthStatus,summarizeMonth} from '@/domain/coverage';
import type {Review} from '@/domain/schemas';
const client={id:'00123-00',reviewDay:5};
const r:Review={id:'r',clientId:client.id,month:'2026-11',status:'cerrada',decision:{type:'mantener',nota:'Conservar la estrategia'},positionId:null,marketViewSnapshot:null,previousConclusion:null,startedAt:'2026-11-01T10:00:00Z',closedAt:'2026-11-01T11:00:00Z'};
const e:BoardEntry={id:'e',clientId:client.id,month:'2026-11',stage:'pausada',updatedAt:'2026-11-02T11:00:00Z',history:[]};
describe('Avance mensual independiente del criterio',()=>{
 it('recupera el avance de revisiones existentes y respeta una pausa posterior',()=>{
  expect(boardStage(null)).toBe('pendiente');expect(boardStage({...r,status:'en_curso',closedAt:null})).toBe('en_revision');expect(boardStage(r)).toBe('revisada');expect(boardStage(r,e)).toBe('pausada');
  expect(r.decision).toEqual({type:'mantener',nota:'Conservar la estrategia'});
 });
 it('una nueva revisión guardada después del movimiento pasa a revisada',()=>{
  expect(boardStage({...r,closedAt:'2026-11-03T11:00:00Z'},e)).toBe('revisada');
 });
 it('marcar revisada sin elegir recomendación cuenta en la cobertura',()=>{
  const state=portfolioMonthStatus(client,'2026-11',[],[],'2026-11-16',[{...e,stage:'revisada'}]);
  expect(state.countsAsReviewed).toBe(true);expect(state.review).toBeNull();expect(state.isOverdue).toBe(false);
  expect(summarizeMonth([client],[],[],'2026-11','2026-11-16',[{...e,stage:'revisada'}]).coverage).toBe(1);
 });
 it('una pausa quita la urgencia y el avance no se arrastra al mes siguiente',()=>{
  expect(portfolioMonthStatus(client,'2026-11',[],[],'2026-11-16',[e]).isOverdue).toBe(false);
  expect(portfolioMonthStatus(client,'2026-12',[],[],'2026-12-16',[e]).countsAsReviewed).toBe(false);
 });
 it('rechaza columnas y meses inexistentes',()=>{
  expect(boardInputSchema.safeParse({clientId:client.id,month:'2026-13',stage:'revisada'}).success).toBe(false);
  expect(boardInputSchema.safeParse({clientId:client.id,month:'2026-11',stage:'eliminada'}).success).toBe(false);
 });
});
