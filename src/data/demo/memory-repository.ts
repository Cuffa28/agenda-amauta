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
import { BA_TZ } from "@/domain/dates";

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
 * Repositorio DEMO en memoria del navegador. Se reinicia al recargar la página.
 * No persiste en localStorage ni simula conexiones externas.
 */
export function createMemoryRepository(
  dataset: DemoDataset,
  now: () => Date = () => new Date(),
): AgendaRepository {
  const state = clone(dataset);
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

