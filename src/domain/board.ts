import { z } from "zod";
import { monthSchema, clientIdSchema, type Review } from "./schemas";
export const BOARD_STAGES = ["pendiente", "en_revision", "revisada", "pausada"] as const;
export const BOARD_LABELS: Record<BoardStage, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  revisada: "Revisada",
  pausada: "Pausada",
};
export type BoardStage = (typeof BOARD_STAGES)[number];
/**
 * Columnas visibles. "En revisión" ya no se usa (nunca se movió una tarjeta ahí):
 * sigue siendo un valor válido guardado, pero se muestra como Pendiente.
 */
export const VISIBLE_STAGES = [
  "pendiente",
  "revisada",
  "pausada",
] as const satisfies readonly BoardStage[];
export const boardInputSchema = z.object({
  clientId: clientIdSchema,
  month: monthSchema,
  stage: z.enum(BOARD_STAGES),
  expectedUpdatedAt: z.string().optional(),
});
export type BoardInput = z.infer<typeof boardInputSchema>;
export interface BoardEntry {
  id: string;
  clientId: string;
  month: string;
  stage: BoardStage;
  updatedAt: string;
  history: { stage: BoardStage; at: string }[];
  /** Derivado de una pausa vigente: fecha de regreso (null = sin fecha). */
  pausedUntil?: string | null;
  /** Derivado: la pausa terminó este mes en esa fecha. */
  resumedOn?: string;
  /** Derivado: updated_at real de la fila del mes (null si todavía no existe). */
  rowUpdatedAt?: string | null;
}
/** Valor esperado para el control de concurrencia al mover la tarjeta. */
export function entryVersion(entry?: BoardEntry): string | undefined {
  if (!entry) return undefined;
  return entry.rowUpdatedAt !== undefined ? (entry.rowUpdatedAt ?? undefined) : entry.updatedAt;
}
/** Avance mensual separado de la decisión. Una revisión guardada después del último movimiento finaliza el trabajo. */
export function boardStage(review: Review | null | undefined, entry?: BoardEntry): BoardStage {
  // Una pausa ya vencida no retiene la tarjeta: vuelve a su estado natural.
  if (entry?.resumedOn && entry.stage === "pausada") entry = undefined;
  if (entry && (!review?.closedAt || entry.updatedAt >= review.closedAt))
    return entry.stage === "en_revision" ? "pendiente" : entry.stage;
  return review?.status === "cerrada" ? "revisada" : "pendiente";
}
