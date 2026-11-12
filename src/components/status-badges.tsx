import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { PortfolioStatus, Urgency } from "@/domain/coverage";

type Variant = NonNullable<BadgeProps["variant"]>;

const PORTFOLIO: Record<PortfolioStatus, { label: string; variant: Variant }> = {
  revisada: { label: "Revisada", variant: "success" },
  revisada_con_pendiente: { label: "Revisada · pendiente abierto", variant: "info" },
  en_curso: { label: "En curso", variant: "muted" },
  vence_hoy: { label: "Vence hoy", variant: "warning" },
  atrasada: { label: "Atrasada", variant: "danger" },
  sin_programar: { label: "Sin programar", variant: "outline" },
  programada: { label: "Programada", variant: "outline" },
};

export const PORTFOLIO_STATUS_LABELS = Object.fromEntries(
  Object.entries(PORTFOLIO).map(([k, v]) => [k, v.label]),
) as Record<PortfolioStatus, string>;

export function PortfolioStatusBadge({ status, overdue }: { status: PortfolioStatus; overdue?: boolean }) {
  if (status === "en_curso" && overdue) return <Badge variant="danger">En curso · atrasada</Badge>;
  const { label, variant } = PORTFOLIO[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const URGENCY: Record<Urgency, { label: string; variant: Variant }> = {
  vencido: { label: "Vencido", variant: "danger" },
  hoy: { label: "Hoy", variant: "warning" },
  proximos_7_dias: { label: "Próximos 7 días", variant: "info" },
  posterior: { label: "Posterior", variant: "outline" },
};

export const URGENCY_LABELS = Object.fromEntries(
  Object.entries(URGENCY).map(([k, v]) => [k, v.label]),
) as Record<Urgency, string>;

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <Badge variant={URGENCY[urgency].variant}>{URGENCY[urgency].label}</Badge>;
}

export function DemoBadge() {
  return <Badge variant="demo">DEMO</Badge>;
}

