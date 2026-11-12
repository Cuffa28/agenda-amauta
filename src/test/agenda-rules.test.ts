import { describe,it,expect } from 'vitest';
import { buildDemoDataset } from '@/data/demo/seed';
import { createMemoryRepository } from '@/data/demo/memory-repository';
import { portfolioMonthStatus } from '@/domain/coverage';
import { clientIdSchema,followUpInputSchema } from '@/domain/schemas';
import { buildFollowUpPreview } from '@/domain/follow-up';
import { draftFingerprint,generateEmailDraft } from '@/domain/email-draft';

describe('Reglas de Agenda',()=>{
 it('conserva el identificador real como texto',()=>{
  expect(clientIdSchema.parse('00123-00')).toBe('00123-00');
  expect(clientIdSchema.safeParse(123).success).toBe(false);
 });
 it('cuenta la revisión cerrada y conserva su pendiente y visión original',async()=>{
  const repo=createMemoryRepository(buildDemoDataset('2026-11-11'));
  const client=(await repo.listClients())[0]!;
  const r=await repo.startReview({clientId:client.id,month:'2027-02'});
  await repo.saveDecision(r.id,{type:'falta_informacion',informacionFaltante:'Confirmar necesidad de liquidez',fechaLimite:'2027-02-20'});
  await repo.closeReview(r.id);
  await repo.publishMarketViewVersion({title:'Nueva visión',summary:'Nuevo escenario de tasas',body:'Una nueva versión que no debe alterar las revisiones previas.',author:'Prueba'});
  const reviews=await repo.listReviews();const pending=await repo.listPendings();
  const state=portfolioMonthStatus(client,'2027-02',reviews,pending,'2027-02-21');
  expect(state.countsAsReviewed).toBe(true);
  expect(state.status).toBe('revisada_con_pendiente');
  expect(state.openPendings[0]?.dueDate).toBe('2027-02-20');
  expect(reviews.find(x=>x.id===r.id)?.marketViewSnapshot).toEqual(r.marketViewSnapshot);
  await expect(repo.saveDecision(r.id,{type:'mantener',nota:'Cambio posterior'})).rejects.toThrow();
 });
 it('el borrador refleja la nota y detecta un cambio en la ficha',async()=>{
  const repo=createMemoryRepository(buildDemoDataset('2026-11-11'));
  const client=(await repo.listClients())[0]!;
  const advisor=(await repo.listAdvisors()).find(x=>x.id===client.advisorId)!;
  const review=await repo.startReview({clientId:client.id,month:'2027-03'});
  review.decision={type:'mantener',nota:'Mantener liquidez para pago de proveedores.'};
  const source={client,advisor,review,position:(await repo.listPositions()).find(p=>p.clientId===client.id)??null};
  expect(generateEmailDraft(source).body).toContain('Mantener liquidez para pago de proveedores.');
  const hash=draftFingerprint(source);
  source.review.decision={type:'mantener',nota:'Revisar horizonte antes de operar.'};
  expect(draftFingerprint(source)).not.toBe(hash);
 });
 it('previsualiza un seguimiento que cruza medianoche y rechaza invitados',()=>{
  const p=buildFollowUpPreview({date:'2026-11-11',time:'23:45',durationMinutes:30});
  expect(p.endDate).toBe('2026-11-12');expect(p.endTime).toBe('00:15');
  expect(followUpInputSchema.safeParse({clientId:'00123-00',title:'Revisión',link:{kind:'revision',reviewId:'r1'},date:'2026-11-11',time:'10:00',durationMinutes:30,invitados:['x@example.com']}).success).toBe(false);
 });
});
