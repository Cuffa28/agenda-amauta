import { z } from "zod";
import { addDays, todayInBuenosAires } from "./dates";
import type { Review } from "./schemas";

/**
 * Seguimiento de "Recomiendo cambio". Registra solo la respuesta del asesor:
 * no equivale a la aceptación del cliente ni a la ejecución de la operación.
 */
export const RECOMMENDATION_STATES = ["esperando", "validada", "descartada"] as const;
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];
export const RECOMMENDATION_LABELS: Record<RecommendationState, string> = {
  esperando: "Esperando asesor",
  validada: "Validada por el asesor",
  descartada: "Descartada",
};
/** Días sin respuesta antes de que aparezca en Mi semana. */
export const RECOMMENDATION_STALE_DAYS = 5;

export interface RecommendationRecord {
  id: string;
  reviewId: string;
  clientId: string;
  state: RecommendationState;
  /** Día del último cambio de estado (AAAA-MM-DD, Buenos Aires). */
  on: string;
  note: string;
  updatedAt: string;
  history: { state: RecommendationState; on: string; note: string; at: string }[];
}

export const recommendationInputSchema = z.object({
  reviewId: z.string().min(1),
  state: z.enum(RECOMMENDATION_STATES),
  note: z.string().trim().max(500, "Máximo 500 caracteres").default(""),
});
export type RecommendationInput = z.input<typeof recommendationInputSchema>;

export interface RecommendationStatus {
  reviewId: string;
  clientId: string;
  month: string;
  state: RecommendationState;
  since: string;
  note: string;
  record?: RecommendationRecord;
}

/** Estado vigente de una recomendación cerrada; null si la revisión no recomienda un cambio. */
export function recommendationStatus(
  review: Review | null | undefined,
  records: RecommendationRecord[],
): RecommendationStatus | null {
  if (!review || review.status !== "cerrada" || review.decision?.type !== "proponer_cambio")
    return null;
  const record = records.find((r) => r.reviewId === review.id);
  const base = { reviewId: review.id, clientId: review.clientId, month: review.month };
  if (record) return { ...base, state: record.state, since: record.on, note: record.note, record };
  const since = review.closedAt
    ? todayInBuenosAires(new Date(review.closedAt))
    : review.month + "-01";
  // La validación cargada en el análisis detallado se respeta como punto de partida.
  const state = review.decision.validacionAsesor === "validada" ? "validada" : "esperando";
  return { ...base, state, since, note: "" };
}

/**
 * Recomendaciones esperando al asesor, con el día en que se cumplen N días sin
 * respuesta. Mi semana las muestra ese día y, si siguen sin respuesta, entre
 * las anteriores sin resolver. No se envía ningún aviso.
 */
export function waitingRecommendations(
  reviews: Review[],
  records: RecommendationRecord[],
  days = RECOMMENDATION_STALE_DAYS,
): (RecommendationStatus & { dueDate: string })[] {
  return reviews
    .map((r) => recommendationStatus(r, records))
    .filter((s): s is RecommendationStatus => !!s && s.state === "esperando")
    .map((s) => ({ ...s, dueDate: addDays(s.since, days) }));
}
