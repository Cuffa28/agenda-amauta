import { z } from "zod";
import { isRealDate } from "./dates";
import { clientIdSchema } from "./schemas";

/**
 * Tarea propia de la agenda (lectura, research, reunión…). Distinta de los
 * pendientes de una revisión de cartera: no requiere cliente ni fecha.
 * "Quitada" nunca se borra: se puede recuperar.
 */
export const TASK_STATUSES = ["abierta", "hecha", "quitada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  /** AAAA-MM-DD o null (grupo "Sin fecha"). */
  dueDate: string | null;
  clientId: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Escribí un título").max(200, "Máximo 200 caracteres"),
  dueDate: z.string().refine(isRealDate, "Fecha inválida").nullable(),
  clientId: clientIdSchema.nullable(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskDateSchema = z.string().refine(isRealDate, "Fecha inválida").nullable();
