import type {BoardEntry,BoardInput} from '@/domain/board';
import type {ClientPause,PauseInput} from '@/domain/pause';
import type {Task,TaskInput,TaskStatus} from '@/domain/task';
import type {RecommendationInput,RecommendationRecord} from '@/domain/recommendation';
import type {AdvisorRequest,RequestInput,RequestStatus} from '@/domain/request';
import type {ClientContext, ClientNotebook, ClientNote} from '@/domain/client-notebook';
import type { ZodError, ZodTypeAny, z } from "zod";

import type {
  Advisor,
  Client,
  ClientUpdate,
  Decision,
  EmailDraft,
  EmailDraftInput,
  FollowUp,
  FollowUpInput,
  MarketViewVersion,
  MarketViewVersionInput,
  PendingInput,
  PendingItem,
  Position,
  Review,
} from "@/domain/schemas";

export interface MarketView {
  id: string;
  name: string;
  /** Ordenadas de la más nueva a la más vieja. Inmutables. */
  versions: MarketViewVersion[];
}

export type RepositoryMode = "demo-memoria" | "supabase";

/**
 * Contrato de acceso a datos. La UI solo depende de esta interfaz:
 * hoy la implementa la memoria DEMO; luego, un repositorio Supabase.
 * No existe ningún método para enviar correos.
 */
export interface AgendaRepository {
  readonly mode: RepositoryMode;
  getClientNotebook(clientId:string):Promise<ClientNotebook>;
  saveClientContext(clientId:string, context:ClientContext, expectedUpdatedAt?:string):Promise<ClientNotebook>;
  addClientNote(clientId:string, note:Pick<ClientNote,'body'|'source'>):Promise<ClientNote>;
  listBoardEntries(month:string):Promise<BoardEntry[]>;
  moveBoardEntry(input:BoardInput):Promise<BoardEntry>;
  /** Una pausa por cliente (la última), con historial de pausas y retomas. */
  listPauses():Promise<ClientPause[]>;
  pauseClient(input:PauseInput):Promise<ClientPause>;
  /** Retoma antes de la fecha prevista. Sin pausa activa no hace nada. */
  resumeClient(clientId:string):Promise<ClientPause|null>;
  /** Tareas propias (captura rápida), separadas de los pendientes de cartera. */
  listTasks():Promise<Task[]>;
  createTask(input:TaskInput):Promise<Task>;
  rescheduleTask(id:string, dueDate:string|null, expectedUpdatedAt:string):Promise<Task>;
  /** Hecha o quitada se pueden revertir a abierta: nunca se borra. */
  setTaskStatus(id:string, status:TaskStatus, expectedUpdatedAt:string):Promise<Task>;
  listRecommendationRecords():Promise<RecommendationRecord[]>;
  saveRecommendationState(input:RecommendationInput):Promise<RecommendationRecord>;
  /** Pedidos de asesores. Clientes elegibles: solo número y nombre (el asesor no lee la ficha). */
  listRequestClients():Promise<{id:string;name:string}[]>;
  /** El owner ve todos; un asesor, solo los que escribió él (lo filtra la base). */
  listRequests():Promise<AdvisorRequest[]>;
  /** Autor, fecha y estado inicial los fija la base. */
  createRequest(input:RequestInput):Promise<AdvisorRequest>;
  /** Solo owner y solo pedidos puntuales. Al cambiar de estado deja de ser "Nuevo". */
  setRequestStatus(id:string, status:RequestStatus, expectedUpdatedAt:string):Promise<AdvisorRequest>;
  markRequestSeen(id:string, expectedUpdatedAt:string):Promise<AdvisorRequest>;
  /** Indicación vigente → ya no aplica (owner o su autor). */
  retireIndication(id:string):Promise<AdvisorRequest>;
  listAdvisors(): Promise<Advisor[]>;
  listClients(): Promise<Client[]>;
  updateClient(id: string, patch: ClientUpdate): Promise<Client>;
  /** Última posición conocida de cada cliente. */
  listPositions(clientId?: string): Promise<Position[]>;
  savePosition(input: Position): Promise<Position>;
  listPositionHistory(clientId: string): Promise<Position[]>;
  removePositionPdf(positionId: string, clientId: string): Promise<Position>;
  listReviews(clientId?: string): Promise<Review[]>;
  /** Crea la revisión del mes y congela la versión vigente de la visión de mercado. */
  startReview(input: { clientId: string; month: string }): Promise<Review>;
  setReviewPosition(reviewId: string, positionId: string): Promise<Review>;
  saveDecision(reviewId: string, decision: Decision): Promise<Review>;
  saveReviewAnalysis(reviewId: string, analysis: string): Promise<Review>;
  closeReview(reviewId: string): Promise<Review>;
  cancelEmptyReview(reviewId: string): Promise<Review>;
  listPendings(clientId?: string): Promise<PendingItem[]>;
  createPending(input: PendingInput): Promise<PendingItem>;
  resolvePending(id: string): Promise<PendingItem>;
  getMarketView(): Promise<MarketView>;
  publishMarketViewVersion(input: MarketViewVersionInput): Promise<MarketViewVersion>;
  listEmailDrafts(clientId?: string): Promise<EmailDraft[]>;
  saveEmailDraft(input: EmailDraftInput): Promise<EmailDraft>;
  listFollowUps(): Promise<FollowUp[]>;
  createFollowUp(input: FollowUpInput): Promise<FollowUp>;
}

export class RepositoryValidationError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(issues.map((i) => i.message).join(" · "));
    this.name = "RepositoryValidationError";
  }
  static fromZod(error: ZodError) {
    return new RepositoryValidationError(
      error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} no encontrado: ${id}`);
    this.name = "RepositoryNotFoundError";
  }
}

export class RepositoryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryRuleError";
  }
}

export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw RepositoryValidationError.fromZod(result.error);
  return result.data;
}

