import {boardInputSchema,type BoardEntry} from '@/domain/board';
import {clientContextSchema,clientNoteSchema,emptyContext,type ClientNotebook} from '@/domain/client-notebook';
import { describeDecision } from "@/domain/decision";
import {
  clientUpdateSchema,
  positionSchema,
  decisionSchema,
  reviewSchema,
  emailDraftInputSchema,
  followUpInputSchema,
  marketViewVersionInputSchema,
  monthSchema,
  pendingInputSchema,
  type MarketViewSnapshot,
  type Review,
  type FollowUp,
} from "@/domain/schemas";
import { BA_TZ, todayInBuenosAires } from "@/domain/dates";
import { isPauseActive, pauseInputSchema, type ClientPause } from "@/domain/pause";
import { taskDateSchema, taskInputSchema, TASK_STATUSES, type Task } from "@/domain/task";
import { recommendationInputSchema, type RecommendationRecord } from "@/domain/recommendation";
import {
  advisorVisibleClients,
  PEDIDO_STATUSES,
  requestInputSchema,
  type AdvisorRequest,
} from "@/domain/request";
import { z } from "zod";

import {
  parseOrThrow,
  RepositoryNotFoundError,
  RepositoryRuleError,
  type AgendaRepository,
} from "../repository";
import type { DemoDataset } from "./seed";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Quién usa la demo. En la base real lo determina la sesión y agenda_access;
 * acá se puede cambiar para probar la pantalla del asesor sin recargar.
 */
export const demoViewer: { role: "owner" | "asesor"; email: string } = {
  role: "owner",
  email: "owner@example.com",
};

/**
 * Repositorio DEMO en memoria del navegador. Se reinicia al recargar la página.
 * No persiste en localStorage ni simula conexiones externas.
 */
export function createMemoryRepository(
  dataset: DemoDataset,
  now: () => Date = () => new Date(),
): AgendaRepository {
  const state = clone(dataset);
  const notebooks = new Map<string,ClientNotebook>();
  const board = new Map<string,BoardEntry>();
  const pauses = new Map<string,ClientPause>();
  const tasks = new Map<string,Task>();
  const recommendations = new Map<string,RecommendationRecord>();
  const requests = new Map<string,AdvisorRequest>();
  const visibleClients = () => demoViewer.role === 'owner' ? state.clients : advisorVisibleClients(state.clients, state.advisors, demoViewer.email, []);
  const requireOwner = () => { if (demoViewer.role !== 'owner') throw new RepositoryRuleError('Solo Facundo puede cambiar el estado.'); };
  const findRequest = (id:string, expected?:string) => { const r=requests.get(id); if(!r||(demoViewer.role!=='owner'&&r.authorEmail!==demoViewer.email))throw new RepositoryNotFoundError('Pedido',id); if(expected!==undefined&&r.updatedAt!==expected)throw new RepositoryRuleError('El pedido cambió en otra sesión. Recargá.'); return r; };
  const findTask = (id:string,expected:string) => {const t=tasks.get(id);if(!t)throw new RepositoryNotFoundError('Tarea',id);if(t.updatedAt!==expected)throw new RepositoryRuleError('La tarea cambió en otra sesión.');return t;};
  state.reviews.forEach((r) => deepFreeze(r.marketViewSnapshot));
  state.marketView.versions.forEach((v) => deepFreeze(v));
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-n${(++seq).toString().padStart(4, "0")}`;
  const nowIso = () => now().toISOString();

  const findReview = (id: string) => {
    const review = state.reviews.find((r) => r.id === id);
    if (!review) throw new RepositoryNotFoundError("Revisión", id);
    return review;
  };
  const latestVersion = () => {
    const sorted = [...state.marketView.versions].sort((a, b) => b.version - a.version);
    if (!sorted[0]) throw new RepositoryRuleError("No hay una versión publicada de la visión de mercado");
    return sorted[0];
  };

  return {
    mode: "demo-memoria",
    async listBoardEntries(month) {parseOrThrow(monthSchema,month);return clone([...board.values()].filter(e=>e.month===month));},
    async moveBoardEntry(input) {const p=parseOrThrow(boardInputSchema,input);if(!state.clients.some(c=>c.id===p.clientId))throw new RepositoryNotFoundError('Cliente',p.clientId);const id=p.clientId+':'+p.month,old=board.get(id);if(old?.updatedAt!==p.expectedUpdatedAt)throw new RepositoryRuleError('La tarjeta cambió en otra sesión.');const at=nowIso();const next={id,clientId:p.clientId,month:p.month,stage:p.stage,updatedAt:at,history:[...(old?.history||[]),{stage:p.stage,at}]};board.set(id,next);return clone(next);},
    async listPauses() {return clone([...pauses.values()]);},
    async pauseClient(input) {
      const p=parseOrThrow(pauseInputSchema,input);if(!state.clients.some(c=>c.id===p.clientId))throw new RepositoryNotFoundError('Cliente',p.clientId);
      const today=todayInBuenosAires(now());if(p.until!==null&&p.until<=today)throw new RepositoryRuleError('La fecha de regreso tiene que ser posterior a hoy.');
      const old=pauses.get(p.clientId),at=nowIso();
      const next:ClientPause={id:'pausa-'+p.clientId,clientId:p.clientId,since:today,until:p.until,endedOn:null,updatedAt:at,history:[...(old?.history||[]),{action:'pausa',on:today,until:p.until,at}]};
      pauses.set(p.clientId,next);return clone(next);
    },
    async resumeClient(clientId) {
      const old=pauses.get(clientId),today=todayInBuenosAires(now());if(!old||!isPauseActive(old,today))return null;
      const at=nowIso();const next:ClientPause={...old,endedOn:today,updatedAt:at,history:[...old.history,{action:'retoma',on:today,at}]};
      pauses.set(clientId,next);return clone(next);
    },
    async listRequestClients() {return visibleClients().map(c=>({id:c.id,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name));},
    async listRequests() {return clone([...requests.values()].filter(r=>demoViewer.role==='owner'||r.authorEmail===demoViewer.email).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));},
    async createRequest(input) {
      if(demoViewer.role!=='asesor')throw new RepositoryRuleError('Los pedidos los cargan los asesores.');
      const p=parseOrThrow(requestInputSchema,input);if(!visibleClients().some(c=>c.id===p.clientId))throw new RepositoryRuleError('Ese cliente no está entre los tuyos.');
      const at=nowIso(),status=p.kind==='pedido'?'recibido' as const:'vigente' as const;
      const r:AdvisorRequest={id:newId('pedido'),clientId:p.clientId,kind:p.kind,body:p.body,desiredDate:p.desiredDate,authorEmail:demoViewer.email,status,seenAt:null,createdAt:at,updatedAt:at,history:[{status,by:demoViewer.email,at}]};
      requests.set(r.id,r);return clone(r);
    },
    async setRequestStatus(id,status,expected) {
      requireOwner();const old=findRequest(id,expected);if(old.kind!=='pedido')throw new RepositoryRuleError('Una indicación no tiene ese estado.');
      const s=parseOrThrow(z.enum(PEDIDO_STATUSES),status),at=nowIso();
      const next={...old,status:s,seenAt:at,updatedAt:at,history:s===old.status?old.history:[...old.history,{status:s,by:demoViewer.email,at}]};requests.set(id,next);return clone(next);
    },
    async markRequestSeen(id,expected) {requireOwner();const old=findRequest(id,expected),at=nowIso();const next={...old,seenAt:at,updatedAt:at};requests.set(id,next);return clone(next);},
    async retireIndication(id) {
      const old=findRequest(id);if(old.kind!=='indicacion'||old.status!=='vigente')throw new RepositoryRuleError('La indicación ya no estaba vigente.');
      const at=nowIso();const next={...old,status:'ya_no_aplica' as const,updatedAt:at,history:[...old.history,{status:'ya_no_aplica' as const,by:demoViewer.email,at}]};requests.set(id,next);return clone(next);
    },
    async listTasks() {return clone([...tasks.values()]);},
    async createTask(input) {
      const p=parseOrThrow(taskInputSchema,input);if(p.clientId&&!state.clients.some(c=>c.id===p.clientId))throw new RepositoryNotFoundError('Cliente',p.clientId);
      const at=nowIso();const t:Task={id:newId('tarea'),title:p.title,dueDate:p.dueDate,clientId:p.clientId,status:'abierta',createdAt:at,updatedAt:at,closedAt:null};
      tasks.set(t.id,t);return clone(t);
    },
    async rescheduleTask(id,dueDate,expected) {const old=findTask(id,expected);const next={...old,dueDate:parseOrThrow(taskDateSchema,dueDate),updatedAt:nowIso()};tasks.set(id,next);return clone(next);},
    async setTaskStatus(id,status,expected) {const old=findTask(id,expected);const s=parseOrThrow(z.enum(TASK_STATUSES),status),at=nowIso();const next={...old,status:s,closedAt:s==='abierta'?null:at,updatedAt:at};tasks.set(id,next);return clone(next);},
    async listRecommendationRecords() {return clone([...recommendations.values()]);},
    async saveRecommendationState(input) {
      const p=parseOrThrow(recommendationInputSchema,input),review=findReview(p.reviewId);
      if(review.status!=='cerrada'||review.decision?.type!=='proponer_cambio')throw new RepositoryRuleError('Solo se sigue una recomendación de cambio ya guardada.');
      const old=recommendations.get(review.id),on=todayInBuenosAires(now()),at=nowIso();
      const next:RecommendationRecord={id:'rec-'+review.id,reviewId:review.id,clientId:review.clientId,state:p.state,on,note:p.note,updatedAt:at,history:[...(old?.history||[]),{state:p.state,on,note:p.note,at}]};
      recommendations.set(review.id,next);return clone(next);
    },
    async listClientContexts() {return clone([...notebooks.entries()].filter(([,n])=>n.updatedAt).map(([clientId,n])=>({clientId,context:n.context,updatedAt:n.updatedAt!})));},
    async getClientNotebook(id) {if(!state.clients.some(c=>c.id===id))throw new RepositoryNotFoundError('Cliente',id);return clone(notebooks.get(id)||{context:{...emptyContext},notes:[]});},
    async saveClientContext(id,context,expected) {const old=await this.getClientNotebook(id);if(old.updatedAt!==expected)throw new RepositoryRuleError('El contexto cambió en otra sesión.');const next={...old,context:parseOrThrow(clientContextSchema,context),updatedAt:nowIso()};notebooks.set(id,next);return clone(next);},
    async addClientNote(id,input) {const old=await this.getClientNotebook(id);const note={...parseOrThrow(clientNoteSchema,input),id:newId('note'),at:nowIso()};notebooks.set(id,{...old,notes:[note,...old.notes]});return clone(note);},

    async listAdvisors() {
      return clone(state.advisors);
    },

    async listClients() {
      return clone(state.clients);
    },

    async updateClient(id, patch) {
      const data = parseOrThrow(clientUpdateSchema, patch);
      const client = state.clients.find((c) => c.id === id);
      if (!client) throw new RepositoryNotFoundError("Cliente", id);
      if (!state.advisors.some((a) => a.id === data.advisorId)) {
        throw new RepositoryRuleError("El asesor indicado no existe");
      }
      client.name = data.name;
      client.segment = data.segment;
      client.sector = data.sector;
      client.advisorId = data.advisorId;
      return clone(client);
    },

    async savePosition(input) { const position = parseOrThrow(positionSchema, input); state.positions = [position, ...state.positions.filter(p => p.clientId !== position.clientId)]; return clone(position); },

    async removePositionPdf(positionId, clientId) {
      const position = state.positions.find(p => p.id === positionId && p.clientId === clientId);
      if (!position) throw new RepositoryNotFoundError('Posición', positionId);
      position.drivePdf = null;
      return clone(position);
    },
    async saveReviewAnalysis(reviewId, analysis) {
      const review = findReview(reviewId);
      if (review.status === 'cerrada') throw new RepositoryRuleError('La revisión ya está cerrada');
      const parsed = parseOrThrow(reviewSchema, { ...review, analysis });
      review.analysis = parsed.analysis;
      return clone(review);
    },
    async listPositionHistory(clientId) { return clone(state.positions.filter(p => p.clientId === clientId)); },
    async listPositions(clientId) {
      return clone(state.positions.filter(row => !clientId || row.clientId === clientId));
    },

    async listReviews(clientId) {
      return clone(state.reviews.filter(row => !clientId || row.clientId === clientId));
    },

    async startReview({ clientId, month }) {
      parseOrThrow(monthSchema, month);
      if (!state.clients.some((c) => c.id === clientId)) {
        throw new RepositoryNotFoundError("Cliente", clientId);
      }
      if (state.reviews.some((r) => r.clientId === clientId && r.month === month)) {
        throw new RepositoryRuleError("Ya existe una revisión para ese mes");
      }
      const version = latestVersion();
      const previous = state.reviews
        .filter((r) => r.clientId === clientId && r.month < month && r.status === "cerrada" && r.decision)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      const position = state.positions.find((p) => p.clientId === clientId) ?? null;
      const snapshot: MarketViewSnapshot = deepFreeze({
        versionId: version.id,
        version: version.version,
        title: version.title,
        summary: version.summary,
        body: version.body,
        publishedAt: version.publishedAt,
        capturedAt: nowIso(),
      });
      const review: Review = {
        id: newId(`rev-${clientId}-${month}`),
        clientId,
        month,
        status: "en_curso",
        positionId: position?.id ?? null,
        previousConclusion: previous?.decision ? describeDecision(previous.decision) : null,
        decision: null,
        marketViewSnapshot: snapshot,
        startedAt: nowIso(),
        closedAt: null,
      };
      state.reviews.push(review);
      return clone(review);
    },

    async cancelEmptyReview(reviewId) {
      const review = findReview(reviewId);
      if (review.analysis?.trim()) throw new RepositoryRuleError('Esta revisión tiene análisis guardado');
      if (review.decision || review.status === 'cerrada') throw new RepositoryRuleError('Esta revisión ya tiene una decisión guardada');
      if (state.pendings.some(p => p.reviewId === reviewId) || state.drafts.some(d => d.reviewId === reviewId) || state.followUps.some(f => 'reviewId' in f.link && f.link.reviewId === reviewId)) throw new RepositoryRuleError('Esta revisión tiene datos guardados. No está vacía.');
      state.reviews = state.reviews.filter(r => r.id !== reviewId);
      return clone(review);
    },

    async setReviewPosition(reviewId, positionId) {
      const review = findReview(reviewId);
      if (review.status === 'cerrada') throw new RepositoryRuleError('La revisión ya está cerrada');
      if (!state.positions.some(p => p.id === positionId && p.clientId === review.clientId)) throw new RepositoryRuleError('La posición no pertenece a esta cartera');
      review.positionId = positionId;
      return clone(review);
    },

    async saveDecision(reviewId, decision) {
      const data = parseOrThrow(decisionSchema, decision);
      const review = findReview(reviewId);
      if (review.status === "cerrada") throw new RepositoryRuleError("La revisión ya está cerrada");
      review.decision = data;
      return clone(review);
    },

    async closeReview(reviewId) {
      const review = findReview(reviewId);
      if (review.status === "cerrada") throw new RepositoryRuleError("La revisión ya está cerrada");
      if (!review.decision) throw new RepositoryRuleError("Registrá una decisión antes de cerrar");
      const decision = parseOrThrow(decisionSchema, review.decision);
      review.status = "cerrada";
      review.closedAt = nowIso();
      if (
        decision.type === "falta_informacion" &&
        !state.pendings.some((p) => p.reviewId === review.id && p.origin === "falta_informacion")
      ) {
        state.pendings.push({
          id: newId("pen"),
          clientId: review.clientId,
          reviewId: review.id,
          origin: "falta_informacion",
          description: decision.informacionFaltante,
          dueDate: decision.fechaLimite,
          status: "abierto",
          createdAt: nowIso(),
          resolvedAt: null,
        });
      }
      return clone(review);
    },

    async listPendings(clientId) {
      return clone(state.pendings.filter(row => !clientId || row.clientId === clientId));
    },

    async createPending(input) {
      const data = parseOrThrow(pendingInputSchema, input);
      const review = findReview(data.reviewId);
      if (review.clientId !== data.clientId) {
        throw new RepositoryRuleError("La revisión no pertenece a ese cliente");
      }
      const pending = {
        ...data,
        id: newId("pen"),
        status: "abierto" as const,
        createdAt: nowIso(),
        resolvedAt: null,
      };
      state.pendings.push(pending);
      return clone(pending);
    },

    async resolvePending(id) {
      const pending = state.pendings.find((p) => p.id === id);
      if (!pending) throw new RepositoryNotFoundError("Pendiente", id);
      if (pending.status === "resuelto") throw new RepositoryRuleError("El pendiente ya está resuelto");
      pending.status = "resuelto";
      pending.resolvedAt = nowIso();
      return clone(pending);
    },

    async getMarketView() {
      return clone({
        ...state.marketView,
        versions: [...state.marketView.versions].sort((a, b) => b.version - a.version),
      });
    },

    async publishMarketViewVersion(input) {
      const data = parseOrThrow(marketViewVersionInputSchema, input);
      const version = deepFreeze({
        ...data,
        id: newId("vm"),
        marketViewId: state.marketView.id,
        version: latestVersion().version + 1,
        publishedAt: nowIso(),
      });
      state.marketView.versions.push(version);
      return clone(version);
    },

    async listEmailDrafts(clientId) {
      return clone(state.drafts.filter(d => !clientId || state.reviews.some(r => r.id === d.reviewId && r.clientId === clientId)));
    },

    async saveEmailDraft(input) {
      const data = parseOrThrow(emailDraftInputSchema, input);
      findReview(data.reviewId);
      const draft = { ...data, updatedAt: nowIso() };
      const index = state.drafts.findIndex((d) => d.reviewId === data.reviewId);
      if (index >= 0) state.drafts[index] = draft;
      else state.drafts.push(draft);
      return clone(draft);
    },

    async listFollowUps() {
      return clone(state.followUps);
    },

    async createFollowUp(input) {
      const data = parseOrThrow(followUpInputSchema, input);
      const link = data.link;
      if (link.kind === "bloque") {
        if (!link.clientIds.includes(data.clientId) || link.clientIds.some(id => !state.clients.some(c => c.id === id))) throw new RepositoryRuleError("Elegí carteras válidas para el bloque.");
      } else if (link.kind === "pendiente") {
        const pending = state.pendings.find((p) => p.id === link.pendingId);
        if (!pending || pending.clientId !== data.clientId) {
          throw new RepositoryRuleError("El pendiente no pertenece a ese cliente");
        }
      } else {
        const review = findReview(link.reviewId);
        if (review.clientId !== data.clientId) {
          throw new RepositoryRuleError("La revisión no pertenece a ese cliente");
        }
        if (link.kind === "propuesta" && review.decision?.type !== "proponer_cambio") {
          throw new RepositoryRuleError("Esa revisión no tiene una propuesta de cambio");
        }
      }
      const followUp: FollowUp = { ...data, id: newId("seg"), timezone: BA_TZ, createdAt: nowIso() };
      state.followUps.push(followUp);
      return clone(followUp);
    },
  };
}

