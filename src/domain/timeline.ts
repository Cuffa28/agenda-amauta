import { describeDecision } from "./decision";
import { formatMonthLabel } from "./dates";
import type { ClientNote } from "./client-notebook";
import type { RecommendationRecord } from "./recommendation";
import { RECOMMENDATION_LABELS } from "./recommendation";
import type { AdvisorRequest } from "./request";
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS } from "./request";
import type { Review } from "./schemas";
import type { Task } from "./task";

export const TIMELINE_KINDS = ["revision", "nota", "asesor", "tarea", "contexto"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
export const TIMELINE_LABELS: Record<TimelineKind, string> = {
  revision: "Revisiones",
  nota: "Notas",
  asesor: "Asesor",
  tarea: "Tareas",
  contexto: "Contexto",
};

export interface TimelineEntry {
  id: string;
  /** ISO; ordena de lo más nuevo a lo más viejo. */
  at: string;
  kind: TimelineKind;
  title: string;
  body?: string;
}

/**
 * Una sola línea de tiempo por cliente: revisiones, notas, pedidos del asesor,
 * respuestas a recomendaciones, tareas y cambios de contexto, con fecha y tipo.
 * Solo lee; no crea ni duplica registros.
 */
export function buildTimeline(input: {
  clientId: string;
  reviews: Review[];
  notes: ClientNote[];
  requests: AdvisorRequest[];
  tasks: Task[];
  recommendations: RecommendationRecord[];
  contextUpdatedAt?: string | undefined;
}): TimelineEntry[] {
  const { clientId } = input;
  const out: TimelineEntry[] = [];
  for (const r of input.reviews) {
    if (r.clientId !== clientId || r.status !== "cerrada" || !r.decision) continue;
    out.push({
      id: "rev:" + r.id,
      at: r.closedAt || r.startedAt,
      kind: "revision",
      title: `Revisión de ${formatMonthLabel(r.month).toLowerCase()} · ${describeDecision(r.decision)}`,
      ...(r.analysis ? { body: r.analysis } : {}),
    });
  }
  for (const n of input.notes)
    out.push({
      id: "note:" + n.id,
      at: n.at,
      kind: n.source === "asesor" ? "asesor" : "nota",
      title: n.source === "asesor" ? "Me dijo el asesor" : "Nota",
      body: n.body,
    });
  for (const q of input.requests) {
    if (q.clientId !== clientId) continue;
    const author = q.authorEmail.split("@")[0] || q.authorEmail;
    out.push({
      id: "req:" + q.id,
      at: q.createdAt,
      kind: "asesor",
      title: `${REQUEST_KIND_LABELS[q.kind]} de ${author.charAt(0).toUpperCase() + author.slice(1)} · ${REQUEST_STATUS_LABELS[q.status].toLowerCase()}`,
      body: q.body,
    });
  }
  for (const rec of input.recommendations) {
    if (rec.clientId !== clientId) continue;
    for (const h of rec.history)
      out.push({
        id: `rec:${rec.id}:${h.at}`,
        at: h.at,
        kind: "asesor",
        title: `Recomendación: ${RECOMMENDATION_LABELS[h.state].toLowerCase()}`,
        ...(h.note ? { body: h.note } : {}),
      });
  }
  for (const t of input.tasks) {
    if (t.clientId !== clientId) continue;
    out.push({
      id: "task:" + t.id,
      at: t.createdAt,
      kind: "tarea",
      title: "Tarea creada",
      body: t.title,
    });
    if (t.closedAt)
      out.push({
        id: "task-done:" + t.id,
        at: t.closedAt,
        kind: "tarea",
        title: t.status === "hecha" ? "Tarea hecha" : "Tarea quitada",
        body: t.title,
      });
  }
  if (input.contextUpdatedAt)
    out.push({
      id: "ctx",
      at: input.contextUpdatedAt,
      kind: "contexto",
      title: "Contexto actualizado",
    });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Seis meses sin tocar el contexto: conviene revisarlo. */
export function isContextStale(updatedAt: string | undefined, today: string): boolean {
  if (!updatedAt) return false;
  const limit = new Date(today + "T12:00:00Z");
  limit.setUTCMonth(limit.getUTCMonth() - 6);
  return updatedAt.slice(0, 10) < limit.toISOString().slice(0, 10);
}
