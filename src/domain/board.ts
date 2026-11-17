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
}
/** Avance mensual separado de la decisión. Una revisión guardada después del último movimiento finaliza el trabajo. */
export function boardStage(review: Review | null | undefined, entry?: BoardEntry): BoardStage {
  if (entry && (!review?.closedAt || entry.updatedAt >= review.closedAt)) return entry.stage;
  return review?.status === "cerrada" ? "revisada" : review ? "en_revision" : "pendiente";
}
