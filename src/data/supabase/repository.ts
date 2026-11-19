import {boardInputSchema} from '@/domain/board';
import {clientContextSchema,clientNoteSchema,emptyContext} from '@/domain/client-notebook';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeDecision } from '@/domain/decision';
import { stableUuid } from '@/domain/ids';
import { BA_TZ, todayInBuenosAires } from '@/domain/dates';
import { isPauseActive, pauseInputSchema, type ClientPause } from '@/domain/pause';
import { taskDateSchema, taskInputSchema, TASK_STATUSES, type Task, type TaskStatus } from '@/domain/task';
import { recommendationInputSchema, type RecommendationRecord } from '@/domain/recommendation';
import { PEDIDO_STATUSES, requestInputSchema, type AdvisorRequest } from '@/domain/request';
import { z } from 'zod';
import { clientUpdateSchema, decisionSchema, emailDraftInputSchema, followUpInputSchema, marketViewVersionInputSchema, monthSchema, pendingInputSchema, positionSchema, reviewSchema, type Review, type PendingItem, type EmailDraft, type FollowUp, type Position } from '@/domain/schemas';
import { parseOrThrow, RepositoryRuleError, type AgendaRepository } from '../repository';
import { getSupabase, requireAgendaSession } from './client';
import { advisorId, decode, mapAdvisors, mapClient, mapMarket, mapPosition, mapReview, type DbRow } from './mappers';

const TASK_STATUS_DB: Record<TaskStatus, string> = { abierta: 'open', hecha: 'done', quitada: 'cancelled' };
const mapTask = (r: DbRow): Task => ({ id: r['id'], title: r['title'], dueDate: r['due_at'] ? String(r['due_at']).slice(0, 10) : null, clientId: r['client_id'] ?? null, status: r['status'] === 'done' ? 'hecha' : r['status'] === 'cancelled' ? 'quitada' : 'abierta', createdAt: r['created_at'], updatedAt: r['updated_at'], closedAt: r['completed_at'] ?? null });
const mapRecommendation = (r: DbRow): RecommendationRecord => { const s = r['source_snapshot']; return { id: r['id'], reviewId: s.reviewId, clientId: r['client_id'], state: s.state, on: s.on, note: s.note || '', updatedAt: r['updated_at'], history: s.history || [] }; };
const MISSING_TABLE = new Set(['PGRST205', '42P01']);
const mapRequest = (r: DbRow): AdvisorRequest => ({ id: r['id'], clientId: r['client_id'], kind: r['kind'], body: r['body'], desiredDate: r['desired_date'] ?? null, authorEmail: r['author_email'], status: r['status'], seenAt: r['seen_at'] ?? null, createdAt: r['created_at'], updatedAt: r['updated_at'], history: r['status_history'] || [] });
const mapPause = (r: DbRow): ClientPause => { const s = r['source_snapshot']; return { id: r['id'], clientId: s.clientId, since: s.since, until: s.until ?? null, endedOn: s.endedOn ?? null, updatedAt: r['updated_at'], history: s.history || [] }; };

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
  // Pendientes de cartera: se excluyen seguimientos y tareas propias; una fila sin fecha o sin cliente nunca es un pendiente.
  const pendings = async (clientId?: string): Promise<PendingItem[]> => (await rows('agenda_tasks', clientId)).filter(r => !['followup', 'task'].includes(decode(r['notes'])['kind']) && r['due_at'] && r['client_id']).map(r => { const m = decode(r['notes']); return { id: r['id'], clientId: r['client_id'], reviewId: r['review_id'] || m['reviewId'] || '', origin: m['origin'] || 'manual', description: r['title'], dueDate: r['due_at'].slice(0,10), status: r['status'] === 'open' ? 'abierto' : 'resuelto', createdAt: r['created_at'], resolvedAt: r['completed_at'] }; });
  const createPending = async (input: Parameters<AgendaRepository['createPending']>[0]) => {
    const p = parseOrThrow(pendingInputSchema, input), review = await findReview(p.reviewId); if (review.clientId !== p.clientId) throw new RepositoryRuleError('La revisión no pertenece a ese cliente.');
    const row = await insert('agenda_tasks', { client_id: p.clientId, review_id: (await rows('agenda_reviews',review.clientId)).some(r=>r['id']===review.id) ? review.id : null, title: p.description, due_at: `${p.dueDate}T12:00:00-03:00`, notes: JSON.stringify({ kind: 'pending', origin: p.origin, reviewId: p.reviewId }) });
    return { ...p, id: row['id'], status: 'abierto' as const, createdAt: row['created_at'], resolvedAt: null };
  };
  // Las posiciones son inmutables. El retiro del adjunto se registra aparte, sin ampliar permisos.
  const positionHistory = async (clientId?: string): Promise<Position[]> => {
    const [all, removed] = await Promise.all([rows('agenda_positions', clientId), rows('agenda_drafts', clientId, 'position_pdf_removed')]);
    const ids = new Set(removed.map(row => row['source_snapshot'].positionId));
    return all.sort((a,b) => b['as_of'].localeCompare(a['as_of']) || b['created_at'].localeCompare(a['created_at']))
      .map(row => { const position = mapPosition(row); return ids.has(position.id) ? { ...position, drivePdf: null } : position; });
  };
  return {
    mode: 'supabase',
    async listBoardEntries(month) {
      parseOrThrow(monthSchema,month);
      return (await rows('agenda_drafts',undefined,'client_board')).filter(r=>r['source_snapshot'].month===month).map(r=>({...r['source_snapshot'],id:r['id'],updatedAt:r['updated_at']}));
    },
    async moveBoardEntry(input) {
      const p=parseOrThrow(boardInputSchema,input);await findClient(p.clientId);
      const id=await stableUuid(`agenda-board:${p.clientId}:${p.month}`);
      const old=(await rows('agenda_drafts',p.clientId,'client_board')).find(r=>r['id']===id);
      if(old?.['updated_at']!==p.expectedUpdatedAt)throw new RepositoryRuleError('La tarjeta cambió en otra sesión. Recargá el tablero antes de moverla.');
      const history=[...(old?.['source_snapshot'].history||[]),{stage:p.stage,at:new Date().toISOString()}];
      const payload={client_id:p.clientId,subject:'Avance de revisión mensual',body:'',source_snapshot:{kind:'client_board',clientId:p.clientId,month:p.month,stage:p.stage,history}};
      const row=old?await update('agenda_drafts',id,payload,p.expectedUpdatedAt):await insert('agenda_drafts',{...payload,id});
      return {...row['source_snapshot'],id,updatedAt:row['updated_at']};
    },
    // La pausa se guarda por cliente (no por mes) para que sobreviva al cambio de mes.
    async listPauses() {
      return (await rows('agenda_drafts',undefined,'client_pause')).map(mapPause);
    },
    async pauseClient(input) {
      const p=parseOrThrow(pauseInputSchema,input);await findClient(p.clientId);
      const today=todayInBuenosAires();
      if(p.until!==null&&p.until<=today)throw new RepositoryRuleError('La fecha de regreso tiene que ser posterior a hoy.');
      const id=await stableUuid(`agenda-client-pause:${p.clientId}`);
      const old=(await rows('agenda_drafts',p.clientId,'client_pause')).find(r=>r['id']===id);
      const history=[...(old?.['source_snapshot'].history||[]),{action:'pausa',on:today,until:p.until,at:new Date().toISOString()}];
      const payload={client_id:p.clientId,subject:'Pausa de cartera',body:'',source_snapshot:{kind:'client_pause',clientId:p.clientId,since:today,until:p.until,endedOn:null,history}};
      return mapPause(old?await update('agenda_drafts',id,payload,old['updated_at']):await insert('agenda_drafts',{...payload,id}));
    },
    async resumeClient(clientId) {
      const id=await stableUuid(`agenda-client-pause:${clientId}`);
      const old=(await rows('agenda_drafts',clientId,'client_pause')).find(r=>r['id']===id);
      const today=todayInBuenosAires();
      if(!old||!isPauseActive(mapPause(old),today))return null;
      const s=old['source_snapshot'];
      const payload={source_snapshot:{...s,endedOn:today,history:[...(s.history||[]),{action:'retoma',on:today,at:new Date().toISOString()}]}};
      return mapPause(await update('agenda_drafts',id,payload,old['updated_at']));
    },
    async listRequestClients() {
      const { data, error } = await db().rpc('agenda_my_clients'); if (error) throw error;
      return ((data || []) as DbRow[]).map(r => ({ id: r['id'], name: r['name'] }));
    },
    async listRequests() {
      // Mientras la tabla no exista (cambio de base pendiente) no se rompe la agenda.
      const { data, error } = await db().from('agenda_requests').select('*');
      if (error) { if (MISSING_TABLE.has(String(error.code))) return []; throw error; }
      return ((data || []) as DbRow[]).map(mapRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async createRequest(input) {
      const p = parseOrThrow(requestInputSchema, input);
      return mapRequest(await insert('agenda_requests', { client_id: p.clientId, kind: p.kind, body: p.body, desired_date: p.desiredDate }));
    },
    async setRequestStatus(id, status, expected) {
      const s = parseOrThrow(z.enum(PEDIDO_STATUSES), status);
      return mapRequest(await update('agenda_requests', id, { status: s, seen_at: new Date().toISOString() }, expected));
    },
    async markRequestSeen(id, expected) {
      return mapRequest(await update('agenda_requests', id, { seen_at: new Date().toISOString() }, expected));
    },
    async retireIndication(id) {
      const { data, error } = await db().rpc('agenda_retire_indication', { p_id: id }); if (error) throw error;
      const row = ((data || []) as DbRow[])[0]; if (!row) throw new RepositoryRuleError('La indicación ya no estaba vigente.');
      return mapRequest(row);
    },
    async listTasks() {
      return (await rows('agenda_tasks')).filter(r => decode(r['notes'])['kind'] === 'task').map(mapTask);
    },
    async createTask(input) {
      const p = parseOrThrow(taskInputSchema, input);
      if (p.clientId) await findClient(p.clientId);
      try {
        return mapTask(await insert('agenda_tasks', { client_id: p.clientId, title: p.title, due_at: p.dueDate ? `${p.dueDate}T12:00:00-03:00` : null, notes: JSON.stringify({ kind: 'task' }) }));
      } catch (e) {
        // 23502: la base todavía exige cliente y fecha (cambio pendiente en Lovable).
        if ((e as { code?: string }).code === '23502') throw new RepositoryRuleError('Por ahora la base exige cliente y fecha en cada tarea. Falta aplicar el cambio en Lovable para guardarla sin ellos.');
        throw e;
      }
    },
    async rescheduleTask(id, dueDate, expectedUpdatedAt) {
      const d = parseOrThrow(taskDateSchema, dueDate);
      try { return mapTask(await update('agenda_tasks', id, { due_at: d ? `${d}T12:00:00-03:00` : null }, expectedUpdatedAt)); }
      catch (e) { if ((e as { code?: string }).code === '23502') throw new RepositoryRuleError('Por ahora la base exige fecha en cada tarea. Falta aplicar el cambio en Lovable.'); throw e; }
    },
    async setTaskStatus(id, status, expectedUpdatedAt) {
      const s = parseOrThrow(z.enum(TASK_STATUSES), status);
      return mapTask(await update('agenda_tasks', id, { status: TASK_STATUS_DB[s], completed_at: s === 'abierta' ? null : new Date().toISOString() }, expectedUpdatedAt));
    },
    async listRecommendationRecords() {
      return (await rows('agenda_drafts', undefined, 'recommendation_followup')).map(mapRecommendation);
    },
    async saveRecommendationState(input) {
      const p = parseOrThrow(recommendationInputSchema, input), review = await findReview(p.reviewId);
      if (review.status !== 'cerrada' || review.decision?.type !== 'proponer_cambio') throw new RepositoryRuleError('Solo se sigue una recomendación de cambio ya guardada.');
      const id = await stableUuid(`agenda-recommendation:${review.id}`), on = todayInBuenosAires();
      const old = (await rows('agenda_drafts', review.clientId, 'recommendation_followup')).find(r => r['id'] === id);
      const history = [...(old?.['source_snapshot'].history || []), { state: p.state, on, note: p.note, at: new Date().toISOString() }];
      const payload = { client_id: review.clientId, subject: 'Seguimiento de recomendación', body: p.note, source_snapshot: { kind: 'recommendation_followup', reviewId: review.id, state: p.state, on, note: p.note, history } };
      return mapRecommendation(old ? await update('agenda_drafts', id, payload, old['updated_at']) : await insert('agenda_drafts', { ...payload, id }));
    },
    async listClientContexts() {
      return (await rows('agenda_drafts', undefined, 'client_context')).map(r => ({ clientId: r['client_id'], context: parseOrThrow(clientContextSchema, r['source_snapshot'].context), updatedAt: r['updated_at'] }));
    },
    async getClientNotebook(clientId) {
      const all = await rows('agenda_drafts', clientId);
      const context = all.find(r=>r['source_snapshot']?.kind==='client_context');
      return {context:context ? parseOrThrow(clientContextSchema,context['source_snapshot'].context) : {...emptyContext}, updatedAt:context?.['updated_at'], notes:all.filter(r=>r['source_snapshot']?.kind==='client_note').map(r=>({id:r['id'],...parseOrThrow(clientNoteSchema,r['source_snapshot'].note),at:r['created_at']})).sort((a,b)=>b.at.localeCompare(a.at))};
    },
    async saveClientContext(clientId, input, expectedUpdatedAt) {
      const context = parseOrThrow(clientContextSchema,input);
      const old = (await rows('agenda_drafts',clientId,'client_context'))[0];
      if(old && old['updated_at']!==expectedUpdatedAt) throw new RepositoryRuleError('El contexto cambió en otra sesión. Recargá antes de guardar.');
      const payload={client_id:clientId,subject:'Contexto del cliente',body:'',source_snapshot:{kind:'client_context',context}};
      if(old) await update('agenda_drafts',old['id'],payload,expectedUpdatedAt);
      else await insert('agenda_drafts',{...payload,id:await stableUuid('agenda-client-context:'+clientId)});
      return this.getClientNotebook(clientId);
    },
    async addClientNote(clientId,input) {
      const note=parseOrThrow(clientNoteSchema,input);
      const row=await insert('agenda_drafts',{client_id:clientId,subject:'Nota interna del cliente',body:note.body,source_snapshot:{kind:'client_note',note}});
      return {...note,id:row['id'],at:row['created_at']};
    },
    async listAdvisors() { return mapAdvisors(await rows('agenda_clients')); },
    async listClients() { return (await rows('agenda_clients')).filter(r => r['active']).map(mapClient); },
    async updateClient(id, patch) {
      const p = parseOrThrow(clientUpdateSchema, patch), old = await findClient(id), advisors = mapAdvisors(await rows('agenda_clients'));
      const advisor = advisors.find(a => a['id'] === p.advisorId); if (!advisor) throw new RepositoryRuleError('Asesor no encontrado.');
      return mapClient(await update('agenda_clients', id, { name: p.name, segment: p.segment, sector: p.sector || null, advisor_name: p.advisorName !== undefined ? p.advisorName || null : advisor.id === 'unassigned' ? null : advisor.name, advisor_email: p.advisorEmail !== undefined ? p.advisorEmail || null : advisor.email || null, ...(p.reviewDay !== undefined ? { review_day: p.reviewDay || null } : {}) }, p.expectedUpdatedAt || old['updated_at']));
    },
    async listPositions(clientId) { const all = await positionHistory(clientId); return [...new Map([...all].reverse().map(p => [p.clientId, p])).values()]; },
    listPositionHistory: positionHistory,
    async savePosition(input) { const p = parseOrThrow(positionSchema, input); const r = await insert('agenda_positions', { client_id: p.clientId, broker: p.alyc, as_of: p.cutoffDate, drive_url: p.drivePdf ? `https://drive.google.com/file/d/${p.drivePdf.fileId}/view` : null, summary: JSON.stringify({schema:'agenda-position-v1',fileName:p.drivePdf?.fileName||'',sourceNote:p.sourceNote||''}), details: p.items, totals: p.declaredTotals, status: 'manual' }); return mapPosition(r); },
    async removePositionPdf(positionId, clientId) {
      const { data: old, error } = await db().from('agenda_positions').select('*').eq('id', positionId).eq('client_id', clientId).single();
      if (error) throw error;
      if (!old) throw new RepositoryRuleError('Posición no encontrada en esta cartera.');
      const id = await stableUuid(`agenda-position-pdf-removed:${clientId}:${positionId}`);
      try {
        await insert('agenda_drafts', { id, client_id: clientId, subject: 'PDF retirado de la ficha', body: '', source_snapshot: { kind: 'position_pdf_removed', positionId, removedAt: new Date().toISOString() } });
      } catch (error) { if ((error as { code?: string }).code !== '23505') throw error; }
      return { ...mapPosition(old), drivePdf: null };
    },
    async saveReviewAnalysis(id, analysis) {
      const w = await findWorkspace(id), review = w['source_snapshot'].review as Review;
      if (review.status === 'cerrada' || (await rows('agenda_reviews', review.clientId)).some(r => r['id'] === id)) throw new RepositoryRuleError('La revisión ya está cerrada.');
      const parsed = parseOrThrow(reviewSchema, { ...review, analysis });
      return saveWorkspace(w, parsed);
    },
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
      if (review.analysis?.trim()) throw new RepositoryRuleError('Esta revisión tiene análisis guardado. Conservá el cierre habitual.');
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
      if (review.status === 'cerrada' || closed.data) throw new RepositoryRuleError('La revisión ya está cerrada.');
      if (!position.data) throw new RepositoryRuleError('La posición no pertenece a esta cartera.');
      return saveWorkspace(w, { ...review, positionId });
    },
    async saveDecision(id, decision) { const w = await findWorkspace(id), review = w['source_snapshot'].review as Review; if (review.status === 'cerrada' || (await rows('agenda_reviews')).some(r => r['id'] === id)) throw new RepositoryRuleError('La revisión ya está cerrada.'); return saveWorkspace(w, { ...review, decision: parseOrThrow(decisionSchema, decision) }); },
    async closeReview(id) {
      const existing = (await allReviews()).find(r => r['id'] === id && r['status'] === 'cerrada'); if (existing) return existing;
      const w = await findWorkspace(id), r = w['source_snapshot'].review as Review; if (!r['decision']) throw new RepositoryRuleError('Guardá la decisión antes de cerrar.'); const d = parseOrThrow(decisionSchema, r['decision']);
      // Se crea el pendiente antes del cierre; un reintento no lo duplica.
      if (d['type'] === 'falta_informacion' && !(await pendings()).some(p => p.reviewId === id && p.origin === 'falta_informacion')) await createPending({ clientId: r['clientId'], reviewId: id, origin: 'falta_informacion', description: d['informacionFaltante'], dueDate: d['fechaLimite'] });
      // El registro clásico exige fundamentos completos. Una revisión rápida se
      // conserva en su espacio privado existente, con estado y fecha de cierre,
      // sin inventar contenido para satisfacer esas restricciones históricas.
      const quick = d.type === 'mantener' ? !d.nota : d.type === 'proponer_cambio' && (!d.propuesta || !(d.fundamentoHorizonte+d.fundamentoLiquidez).trim() || !d.datoReconsiderar);
      if(quick) return saveWorkspace(w,{...r,decision:d,status:'cerrada',closedAt:new Date().toISOString()});
      const decision = d['type'] === 'mantener' ? 'maintain' : d['type'] === 'proponer_cambio' ? 'propose' : 'missing_info';
      await insert('agenda_reviews', { id, client_id: r['clientId'], period: r['month'] + '-01', position_id: r['positionId'], decision, note: d['type'] === 'mantener' ? d['nota'] : d['type'] === 'falta_informacion' ? d['informacionFaltante'] : '', proposed_change: d['type'] === 'proponer_cambio' ? d['propuesta'] : null, horizon_liquidity_reason: d['type'] === 'proponer_cambio' ? `${d['fundamentoHorizonte']}\n${d['fundamentoLiquidez']}` : null, advisor_validation: d['type'] === 'proponer_cambio' ? d['validacionAsesor'] : null, reconsider_if: d['type'] === 'proponer_cambio' ? d['datoReconsiderar'] : null, market_version_id: r['marketViewSnapshot']?.versionId || null, conclusion: JSON.stringify({ schema: 'agenda-review-v1', decision: d, analysis: r['analysis'] || '', previousConclusion: r['previousConclusion'], startedAt: r['startedAt'] }) });
      return findReview(id);
    },
    listPendings: pendings, createPending,
    async resolvePending(id) { const { data: old, error } = await db().from('agenda_tasks').select('*').eq('id',id).single(); if(error)throw error; await update('agenda_tasks',id,{ status:'done',completed_at:new Date().toISOString() },old['updated_at']); return (await pendings()).find(p=>p.id===id)!; },
    getMarketView: market,
    async publishMarketViewVersion(input) { const p = parseOrThrow(marketViewVersionInputSchema,input); const { user } = await requireAgendaSession(); const row = await insert('agenda_market_versions',{title:p.title,body:JSON.stringify({schema:'agenda-market-v1',summary:p.summary,body:p.body,author:user.email}),as_of:new Date().toLocaleDateString('en-CA',{timeZone:BA_TZ})}); return (await market()).versions.find(v=>v.id===row['id'])!; },
    async listEmailDrafts(clientId): Promise<EmailDraft[]> { return (await rows('agenda_drafts', clientId, 'email_draft')).map(r=>({...r['source_snapshot'].input,updatedAt:r['updated_at'],gmailDraftId:r['gmail_draft_id']||undefined,googleAccount:r['source_snapshot']?.google?.account})); },
    async saveEmailDraft(input) { const p = parseOrThrow(emailDraftInputSchema,input),review=await findReview(p.reviewId),c=await findClient(review.clientId); if(!c['advisor_email'])throw new RepositoryRuleError('Asigná el correo del asesor.');const old=(await rows('agenda_drafts')).filter(d=>d['source_snapshot']?.kind==='email_draft'&&d['source_snapshot'].input?.reviewId===p.reviewId).sort((a,b)=>b['updated_at'].localeCompare(a['updated_at']))[0];const payload={client_id:review.clientId,review_id:(await rows('agenda_reviews',review.clientId)).some(r=>r['id']===review.id)?review.id:null,recipient:c['advisor_email'],subject:p.subject,body:p.body,source_snapshot:{kind:'email_draft',input:p,...(old?.['source_snapshot']?.google?{google:old['source_snapshot'].google}:{})}};const row=old?await update('agenda_drafts',old['id'],payload,old['updated_at']):await insert('agenda_drafts',payload);return {...p,updatedAt:row['updated_at']}; },
    async listFollowUps(): Promise<FollowUp[]> { return (await rows('agenda_tasks')).filter(r=>decode(r['notes'])['kind']==='followup').map(r=>({...decode(r['notes'])['input'],id:r['id'],timezone:BA_TZ,createdAt:r['created_at'],calendarEventId:r['calendar_event_id']||undefined,calendarUrl:decode(r['notes'])['google']?.url,googleAccount:decode(r['notes'])['google']?.account})); },
    async createFollowUp(input) { const p=parseOrThrow(followUpInputSchema,input);const link=p.link;if(link.kind==='bloque'){const all=await this.listClients();if(!link.clientIds.includes(p.clientId)||link.clientIds.some(id=>!all.some(c=>c.id===id)))throw new RepositoryRuleError('Elegí carteras válidas para el bloque.');}else if(link.kind==='pendiente'){const pending=(await pendings()).find(x=>x.id===link.pendingId);if(pending?.clientId!==p.clientId)throw new RepositoryRuleError('Pendiente de otra cartera.');}else{const r=await findReview(link.reviewId);if(r['clientId']!==p.clientId||(link.kind==='propuesta'&&r['decision']?.type!=='proponer_cambio'))throw new RepositoryRuleError('Referencia de seguimiento inválida.');}const row=await insert('agenda_tasks',{client_id:p.clientId,title:p.title,due_at:`${p.date}T${p.time}:00-03:00`,notes:JSON.stringify({kind:'followup',input:p})});return {...p,id:row['id'],timezone:BA_TZ,createdAt:row['created_at']}; },
  };
}
