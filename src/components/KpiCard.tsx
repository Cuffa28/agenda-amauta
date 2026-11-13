import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  children,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "danger" | "warning" | "accent";
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    danger: "text-destructive",
    warning: "text-warning-foreground",
    accent: "text-accent-foreground",
  }[tone];
  return (
    <div className="surface-card metric-card flex flex-col gap-2 p-5" data-tone={tone}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className="metric-icon">{icon}</span></div>
      <div className={`metric-value text-4xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="metric-caption text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

