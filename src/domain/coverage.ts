import { addDays, daysInMonth, diffInDays } from "./dates";
import type { Client, PendingItem, Review } from "./schemas";

/** Vencimiento mensual de la cartera; el día se ajusta al último día del mes si no existe. */
export function dueDateForMonth(reviewDay: number, month: string): string {
  if (!reviewDay) return "";
  const day = Math.min(reviewDay, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export type PortfolioStatus =
  | "revisada"
  | "revisada_con_pendiente"
  | "en_curso"
  | "vence_hoy"
  | "atrasada"
  | "programada"
  | "sin_programar";

export interface PortfolioMonthStatus {
  clientId: string;
  month: string;
  /** Vencimiento original del mes: se conserva aunque la cartera esté revisada. */
  dueDate: string;
  status: PortfolioStatus;
  countsAsReviewed: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  review: Review | null;
  openPendings: PendingItem[];
}

export function portfolioMonthStatus(
  client: Pick<Client, "id" | "reviewDay">,
  month: string,
  reviews: Review[],
  pendings: PendingItem[],
  today: string,
): PortfolioMonthStatus {
  const dueDate = dueDateForMonth(client.reviewDay, month);
  const review = reviews.find((r) => r.clientId === client.id && r.month === month) ?? null;
  const openPendings = review
    ? pendings.filter((p) => p.reviewId === review.id && p.status === "abierto")
    : [];
  const closed = review?.status === "cerrada";
  const isOverdue = !!dueDate && !closed && dueDate < today;
  const isDueToday = !closed && dueDate === today;

  let status: PortfolioStatus;
  if (closed) status = openPendings.length > 0 ? "revisada_con_pendiente" : "revisada";
  else if (review) status = "en_curso";
  else if (isOverdue) status = "atrasada";
  else if (isDueToday) status = "vence_hoy";
  else status = dueDate ? "programada" : "sin_programar";

  return {
    clientId: client.id,
    month,
    dueDate,
    status,
    countsAsReviewed: closed,
    isOverdue,
    isDueToday,
    review,
    openPendings,
  };
}

export interface MonthSummary {
  month: string;
  total: number;
  reviewed: number;
  reviewedWithOpenPending: number;
  inProgress: number;
  /** 0..1 */
  coverage: number;
  dueToday: PortfolioMonthStatus[];
  overdue: PortfolioMonthStatus[];
  statuses: PortfolioMonthStatus[];
}

export function summarizeMonth(
  clients: Pick<Client, "id" | "reviewDay">[],
  reviews: Review[],
  pendings: PendingItem[],
  month: string,
  today: string,
): MonthSummary {
  const statuses = clients.map((c) => portfolioMonthStatus(c, month, reviews, pendings, today));
  const reviewed = statuses.filter((s) => s.countsAsReviewed).length;
  const byDue = (a: PortfolioMonthStatus, b: PortfolioMonthStatus) =>
    a.dueDate.localeCompare(b.dueDate) || a.clientId.localeCompare(b.clientId);
  return {
    month,
    total: clients.length,
    reviewed,
    reviewedWithOpenPending: statuses.filter((s) => s.status === "revisada_con_pendiente").length,
    inProgress: statuses.filter((s) => s.status === "en_curso").length,
    coverage: clients.length === 0 ? 0 : reviewed / clients.length,
    dueToday: statuses.filter((s) => s.isDueToday).sort(byDue),
    overdue: statuses.filter((s) => s.isOverdue).sort(byDue),
    statuses,
  };
}

export type Urgency = "vencido" | "hoy" | "proximos_7_dias" | "posterior";
export const URGENCY_ORDER: Urgency[] = ["vencido", "hoy", "proximos_7_dias", "posterior"];

export function pendingUrgency(dueDate: string, today: string): Urgency {
  if (dueDate < today) return "vencido";
  if (dueDate === today) return "hoy";
  if (dueDate <= addDays(today, 7)) return "proximos_7_dias";
  return "posterior";
}

export interface RankedPending extends PendingItem {
  urgency: Urgency;
  daysFromToday: number;
}

export function rankOpenPendings(pendings: PendingItem[], today: string) {
  const items: RankedPending[] = pendings
    .filter((p) => p.status === "abierto")
    .map((p) => ({
      ...p,
      urgency: pendingUrgency(p.dueDate, today),
      daysFromToday: diffInDays(today, p.dueDate),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientId.localeCompare(b.clientId));
  const counts: Record<Urgency, number> = { vencido: 0, hoy: 0, proximos_7_dias: 0, posterior: 0 };
  for (const item of items) counts[item.urgency] += 1;
  return { items, counts };
}

