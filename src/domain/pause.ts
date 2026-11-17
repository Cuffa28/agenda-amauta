import { z } from "zod";
import type { BoardEntry } from "./board";
import { addMonths, isRealDate, lastDayOfMonth } from "./dates";
import { clientIdSchema } from "./schemas";

/**
 * Pausa de una cartera. Vive en el cliente, no en el mes: así sobrevive al
 * cambio de mes y la cartera vuelve sola a Pendiente en la fecha de regreso.
 */
export interface ClientPause {
  id: string;
  clientId: string;
  /** Día en que se pausó (AAAA-MM-DD, Buenos Aires). */
  since: string;
  /** Primer día en que vuelve a Pendiente. null = sin fecha de regreso. */
  until: string | null;
  /** Día en que se retomó a mano, antes de la fecha prevista. */
  endedOn: string | null;
  updatedAt: string;
  history: { action: "pausa" | "retoma"; on: string; until?: string | null; at: string }[];
}

export const pauseInputSchema = z.object({
  clientId: clientIdSchema,
  until: z.string().refine(isRealDate, "Fecha de regreso inválida").nullable(),
});
export type PauseInput = z.infer<typeof pauseInputSchema>;

/** Primer día del mes siguiente: la opción por defecto al pausar. */
export function nextMonthStart(today: string): string {
  return addMonths(today.slice(0, 7), 1) + "-01";
}

export function isPauseActive(p: ClientPause, today: string): boolean {
  return !p.endedOn && (p.until === null || p.until > today);
}

/**
 * Combina el avance guardado del mes con las pausas vigentes.
 * - Pausa en curso: la tarjeta figura en Pausada, con su fecha de regreso.
 * - Pausa vencida durante el mes: la tarjeta vuelve a su estado natural y queda marcada como retomada.
 * - Meses anteriores al inicio o posteriores al regreso no se tocan.
 * Una revisión cerrada después de pausar sigue ganando (boardStage).
 */
export function applyPauses(
  entries: BoardEntry[],
  pauses: ClientPause[],
  month: string,
  today: string,
): BoardEntry[] {
  const monthStart = month + "-01",
    monthEnd = lastDayOfMonth(month);
  const byClient = new Map(entries.map((e) => [e.clientId, e]));
  for (const p of pauses) {
    const end = p.endedOn ?? p.until;
    if (p.since.slice(0, 7) > month) continue;
    if (end !== null && end <= monthStart) continue;
    const real = byClient.get(p.clientId);
    // Un movimiento manual posterior a la pausa manda.
    if (real && real.updatedAt > p.updatedAt && real.stage !== "pausada") continue;
    const base: BoardEntry = real ?? {
      id: `pausa:${p.clientId}:${month}`,
      clientId: p.clientId,
      month,
      stage: "pausada",
      updatedAt: p.updatedAt,
      history: [],
    };
    const rowUpdatedAt = real?.updatedAt ?? null;
    if (end !== null && end <= today && end <= monthEnd) {
      byClient.set(p.clientId, { ...base, resumedOn: end, rowUpdatedAt });
    } else {
      byClient.set(p.clientId, {
        ...base,
        stage: "pausada",
        updatedAt: base.updatedAt > p.updatedAt ? base.updatedAt : p.updatedAt,
        pausedUntil: p.until,
        rowUpdatedAt,
      });
    }
  }
  return [...byClient.values()];
}
