import type { SupabaseClient } from '@supabase/supabase-js';
import { describeDecision } from '@/domain/decision';
import { stableUuid } from '@/domain/ids';
import { BA_TZ } from '@/domain/dates';
import { clientUpdateSchema, decisionSchema, emailDraftInputSchema, followUpInputSchema, marketViewVersionInputSchema, monthSchema, pendingInputSchema, positionSchema, type Review, type PendingItem, type EmailDraft, type FollowUp, type Position } from '@/domain/schemas';
import { parseOrThrow, RepositoryRuleError, type AgendaRepository } from '../repository';
import { getSupabase, requireAgendaSession } from './client';
import { advisorId, decode, mapAdvisors, mapClient, mapMarket, mapPosition, mapReview, type DbRow } from './mappers';

// Se usan exclusivamente agenda_*; nunca tablas de CRM ni claves privilegiadas.
export function createSupabaseRepository(client: () => SupabaseClient = getSupabase): AgendaRepository {
  const db = () => client();
  const rows = async (table: string, clientId?: string, kind?: string): Promise<DbRow[]> => { let q = db().from(table).select('*'); if (clientId) q = q.eq('client_id', clientId); if (kind) q = q.eq('source_snapshot->>kind', kind); const { data, error } = await q; if (error) throw error; return data || []; };
  const insert = async (table: string, row: DbRow) => { const { data, error } = await db().from(table).insert(row).select().single(); if (error) throw error; return data as DbRow; };
  const update = async (table: string, id: string, row: DbRow, expected?: string) => { let q = db().from(table).update(row).eq('id', id); if (expected) q = q.eq('updated_at', expected); const { data, error } = await q.select().maybeSingle(); if (error) throw error; if (!data) throw new RepositoryRuleError('La ficha cambió en otra sesión. Recargá antes de guardar.'); return data as DbRow; };
  const findClient = async (id: string) => { const { data, error } = await db().from('agenda_clients').select('*').eq('id', id).single(); if (error) throw error; return data as DbRow; };
  const market = async () => { const all = (await rows('agenda_market_versions')).sort((a,b) => a['created_at'].localeCompare(b['created_at']) || a['id'].localeCompare(b['id'])); return { id: 'agenda-market', name: 'Visión de mercado', versions: all.map(mapMarket).reverse() }; };
  const workspaces = (clientId?: string) => rows('agenda_drafts', clientId, 'review_workspace');
  const findWorkspace = async (id: string) => { const { data, error } = await db().from('agenda_drafts').select('*').eq('id', id).single(); if (error || data?.['source_snapshot']?.kind !== 'review_workspace') throw new RepositoryRuleError('Revisión en curso no encontrada.'); return data as DbRow; };
  const saveWorkspace = async (row: DbRow, review: Review) => { await update('agenda_drafts', row['id'], { source_snapshot: { ...row['source_snapshot'], review } }, row['updated_at']); return review; };
  const allReviews = async (clientId?: string, viewPromise = market()): Promise<Review[]> => {
    const [completed, editing, views] = await Promise.all([rows('agenda_reviews', clientId), workspaces(clientId), viewPromise]);
    const ordered = completed.sort((a,b) => b['reviewed_at'].localeCompare(a['reviewed_at']));
    const reviews = ordered.map(r => mapReview(r, views.versions, null));
    return [...reviews, ...editing.filter(w => !reviews.some(r => r['id'] === w['id'])).map(w => w['source_snapshot'].review as Review)];
  };
  const findReview = async (id: string) => { const r = (await allReviews()).find(x => x.id === id); if (!r) throw new RepositoryRuleError('Revisión no encontrada.'); return r; };
  const pendings = async (clientId?: string): Promise<PendingItem[]> => (await rows('agenda_tasks', clientId)).filter(r => decode(r['notes'])['kind'] !== 'followup').map(r => { const m = decode(r['notes']); return { id: r['id'], clientId: r['client_id'], reviewId: r['review_id'] || m['reviewId'] || '', origin: m['origin'] || 'manual', description: r['title'], dueDate: r['due_at'].slice(0,10), status: r['status'] === 'open' ? 'abierto' : 'resuelto', createdAt: r['created_at'], resolvedAt: r['completed_at'] }; });
  const createPending = async (input: Parameters<AgendaRepository['createPending']>[0]) => {
    const p = parseOrThrow(pendingInputSchema, input), review = await findReview(p.reviewId); if (review.clientId !== p.clientId) throw new RepositoryRuleError('La revisión no pertenece a ese cliente.');
    const row = await insert('agenda_tasks', { client_id: p.clientId, review_id: review.status === 'cerrada' ? review.id : null, title: p.description, due_at: `${p.dueDate}T12:00:00-03:00`, notes: JSON.stringify({ kind: 'pending', origin: p.origin, reviewId: p.reviewId }) });
    return { ...p, id: row['id'], status: 'abierto' as const, createdAt: row['created_at'], resolvedAt: null };
  };
  return {
    mode: 'supabase',
    async listAdvisors() { return mapAdvisors(await rows('agenda_clients')); },
    async listClients() { return (await rows('agenda_clients')).filter(r => r['active']).map(mapClient); },
    async updateClient(id, patch) {
      const p = parseOrThrow(clientUpdateSchema, patch), old = await findClient(id), advisors = mapAdvisors(await rows('agenda_clients'));
      const advisor = advisors.find(a => a['id'] === p.advisorId); if (!advisor) throw new RepositoryRuleError('Asesor no encontrado.');
      return mapClient(await update('agenda_clients', id, { name: p.name, segment: p.segment, sector: p.sector || null, advisor_name: p.advisorName !== undefined ? p.advisorName || null : advisor.id === 'unassigned' ? null : advisor.name, advisor_email: p.advisorEmail !== undefined ? p.advisorEmail || null : advisor.email || null, ...(p.reviewDay !== undefined ? { review_day: p.reviewDay || null } : {}) }, p.expectedUpdatedAt || old['updated_at']));
    },
    async listPositions(clientId) { const all = (await rows('agenda_positions', clientId)).sort((a,b) => b['as_of'].localeCompare(a['as_of']) || b['created_at'].localeCompare(a['created_at'])); return [...new Map(all.reverse().map(r => [r['client_id'], mapPosition(r)])).values()]; },
    async savePosition(input) { const p = parseOrThrow(positionSchema, input); const r = await insert('agenda_positions', { client_id: p.clientId, broker: p.alyc, as_of: p.cutoffDate, drive_url: p.drivePdf ? `https://drive.google.com/file/d/${p.drivePdf.fileId}/view` : null, summary: JSON.stringify({schema:'agenda-position-v1',fileName:p.drivePdf?.fileName||'',sourceNote:p.sourceNote||''}), details: p.items, totals: p.declaredTotals, status: 'manual' }); return mapPosition(r); },
    listReviews: allReviews,
    async startReview({ clientId, month }) {
      parseOrThrow(monthSchema, month); await findClient(clientId);
      const viewPromise = market();
      const [reviews, view, positions] = await Promise.all([allReviews(clientId, viewPromise), viewPromise, this.listPositions(clientId)]);
      const existing = reviews.find(r => r.clientId === clientId && r.month === month);
      if (existing) return existing;
      const v = view.versions[0];
      const previous = reviews.filter(r => r['clientId'] === clientId && r['month'] < month && r['status'] === 'cerrada').sort((a,b) => b['month'].localeCompare(a['month']))[0];
      const at = new Date().toISOString(), id = await stableUuid(`agenda-review:${clientId}:${month}`);
      const review: Review = { id, clientId, month, status: 'en_curso', decision: null, positionId: positions.find(p => p.clientId === clientId)?.id || null, previousConclusion: previous?.decision ? describeDecision(previous.decision) : null, marketViewSnapshot: v ? { versionId: v.id, version: v.version, title: v.title, summary: v.summary, body: v.body, publishedAt: v.publishedAt, capturedAt: at } : null, startedAt: at, closedAt: null };
      const { data: archived, error: archivedError } = await db().from('agenda_drafts').select('*').eq('id', id).maybeSingle();
      if (archivedError) throw archivedError;
      if (archived?.['source_snapshot']?.kind === 'review_cancelled') {
        await update('agenda_drafts', id, { source_snapshot: { ...archived['source_snapshot'], kind: 'review_workspace', review } }, archived['updated_at']);
        return review;
      }
      try { await insert('agenda_drafts', { id, client_id: clientId, subject: 'Revisión en curso', body: '', source_snapshot: { kind: 'review_workspace', review } }); } catch (e) { if ((e as {code?: string}).code !== '23505') throw e; return findReview(id); } return review;
    },
    async cancelEmptyReview(id) {
      const w = await findWorkspace(id), review = w['source_snapshot'].review as Review;
      const [completed, tasks, drafts] = await Promise.all([rows('agenda_reviews', review.clientId), rows('agenda_tasks', review.clientId), rows('agenda_drafts', review.clientId, 'email_draft')]);
      if (review.decision || completed.some(r => r['id'] === id)) throw new RepositoryRuleError('Esta revisión ya tiene una decisión guardada. Conservá el cierre habitual.');
      if (tasks.some(r => r['review_id'] === id || decode(r['notes'])['reviewId'] === id || decode(r['notes'])['input']?.link?.reviewId === id) || drafts.some(r => r['source_snapshot']?.input?.reviewId === id)) {
        throw new RepositoryRuleError('Esta revisión tiene pendientes, seguimientos o borradores guardados. No está vacía.');
      }
      await update('agenda_drafts', id, { source_snapshot: { ...w['source_snapshot'], kind: 'review_cancelled', cancellations: [...(w['source_snapshot'].cancellations || []), new Date().toISOString()] } }, w['updated_at']);
      return review;
    },
    async setReviewPosition(id, positionId) {
      const w = await findWorkspace(id), review = w['source_snapshot'].review as Review;
      const [closed, position] = await Promise.all([
        db().from('agenda_reviews').select('id').eq('id', id).maybeSingle(),
        db().from('agenda_positions').select('id,client_id').eq('id', positionId).eq('client_id', review.clientId).maybeSingle(),
      ]);
      if (closed.error) throw closed.error;
      if (position.error) throw position.error;
      if (closed.data) throw new RepositoryRuleError('La revisión ya está cerrada.');
      if (!position.data) throw new RepositoryRuleError('La posición no pertenece a esta cartera.');
      return saveWorkspace(w, { ...review, positionId });
    },
    async saveDecision(id, decision) { const w = await findWorkspace(id), review = w['source_snapshot'].review as Review; if ((await rows('agenda_reviews')).some(r => r['id'] === id)) throw new RepositoryRuleError('La revisión ya está cerrada.'); return saveWorkspace(w, { ...review, decision: parseOrThrow(decisionSchema, decision) }); },
    async closeReview(id) {
      const existing = (await allReviews()).find(r => r['id'] === id && r['status'] === 'cerrada'); if (existing) return existing;
      const w = await findWorkspace(id), r = w['source_snapshot'].review as Review; if (!r['decision']) throw new RepositoryRuleError('Guardá la decisión antes de cerrar.'); const d = parseOrThrow(decisionSchema, r['decision']);
      // Se crea el pendiente antes del cierre; un reintento no lo duplica.
      if (d['type'] === 'falta_informacion' && !(await pendings()).some(p => p.reviewId === id && p.origin === 'falta_informacion')) await createPending({ clientId: r['clientId'], reviewId: id, origin: 'falta_informacion', description: d['informacionFaltante'], dueDate: d['fechaLimite'] });
      const decision = d['type'] === 'mantener' ? 'maintain' : d['type'] === 'proponer_cambio' ? 'propose' : 'missing_info';
      await insert('agenda_reviews', { id, client_id: r['clientId'], period: r['month'] + '-01', position_id: r['positionId'], decision, note: d['type'] === 'mantener' ? d['nota'] : d['type'] === 'falta_informacion' ? d['informacionFaltante'] : '', proposed_change: d['type'] === 'proponer_cambio' ? d['propuesta'] : null, horizon_liquidity_reason: d['type'] === 'proponer_cambio' ? `${d['fundamentoHorizonte']}\n${d['fundamentoLiquidez']}` : null, advisor_validation: d['type'] === 'proponer_cambio' ? d['validacionAsesor'] : null, reconsider_if: d['type'] === 'proponer_cambio' ? d['datoReconsiderar'] : null, market_version_id: r['marketViewSnapshot']?.versionId || null, conclusion: JSON.stringify({ schema: 'agenda-review-v1', decision: d, previousConclusion: r['previousConclusion'], startedAt: r['startedAt'] }) });
      return findReview(id);
    },
    listPendings: pendings, createPending,
    async resolvePending(id) { const { data: old, error } = await db().from('agenda_tasks').select('*').eq('id',id).single(); if(error)throw error; await update('agenda_tasks',id,{ status:'done',completed_at:new Date().toISOString() },old['updated_at']); return (await pendings()).find(p=>p.id===id)!; },
    getMarketView: market,
    async publishMarketViewVersion(input) { const p = parseOrThrow(marketViewVersionInputSchema,input); const { user } = await requireAgendaSession(); const row = await insert('agenda_market_versions',{title:p.title,body:JSON.stringify({schema:'agenda-market-v1',summary:p.summary,body:p.body,author:user.email}),as_of:new Date().toLocaleDateString('en-CA',{timeZone:BA_TZ})}); return (await market()).versions.find(v=>v.id===row['id'])!; },
    async listEmailDrafts(clientId): Promise<EmailDraft[]> { return (await rows('agenda_drafts', clientId, 'email_draft')).map(r=>({...r['source_snapshot'].input,updatedAt:r['updated_at'],gmailDraftId:r['gmail_draft_id']||undefined,googleAccount:r['source_snapshot']?.google?.account})); },
    async saveEmailDraft(input) { const p = parseOrThrow(emailDraftInputSchema,input),review=await findReview(p.reviewId),c=await findClient(review.clientId); if(!c['advisor_email'])throw new RepositoryRuleError('Asigná el correo del asesor.');const old=(await rows('agenda_drafts')).filter(d=>d['source_snapshot']?.kind==='email_draft'&&d['source_snapshot'].input?.reviewId===p.reviewId).sort((a,b)=>b['updated_at'].localeCompare(a['updated_at']))[0];const payload={client_id:review.clientId,review_id:review.status==='cerrada'?review.id:null,recipient:c['advisor_email'],subject:p.subject,body:p.body,source_snapshot:{kind:'email_draft',input:p,...(old?.['source_snapshot']?.google?{google:old['source_snapshot'].google}:{})}};const row=old?await update('agenda_drafts',old['id'],payload,old['updated_at']):await insert('agenda_drafts',payload);return {...p,updatedAt:row['updated_at']}; },
    async listFollowUps(): Promise<FollowUp[]> { return (await rows('agenda_tasks')).filter(r=>decode(r['notes'])['kind']==='followup').map(r=>({...decode(r['notes'])['input'],id:r['id'],timezone:BA_TZ,createdAt:r['created_at'],calendarEventId:r['calendar_event_id']||undefined,calendarUrl:decode(r['notes'])['google']?.url,googleAccount:decode(r['notes'])['google']?.account})); },
    async createFollowUp(input) { const p=parseOrThrow(followUpInputSchema,input);const link=p.link;if(link.kind==='bloque'){const all=await this.listClients();if(!link.clientIds.includes(p.clientId)||link.clientIds.some(id=>!all.some(c=>c.id===id)))throw new RepositoryRuleError('Elegí carteras válidas para el bloque.');}else if(link.kind==='pendiente'){const pending=(await pendings()).find(x=>x.id===link.pendingId);if(pending?.clientId!==p.clientId)throw new RepositoryRuleError('Pendiente de otra cartera.');}else{const r=await findReview(link.reviewId);if(r['clientId']!==p.clientId||(link.kind==='propuesta'&&r['decision']?.type!=='proponer_cambio'))throw new RepositoryRuleError('Referencia de seguimiento inválida.');}const row=await insert('agenda_tasks',{client_id:p.clientId,title:p.title,due_at:`${p.date}T${p.time}:00-03:00`,notes:JSON.stringify({kind:'followup',input:p})});return {...p,id:row['id'],timezone:BA_TZ,createdAt:row['created_at']}; },
  };
}
