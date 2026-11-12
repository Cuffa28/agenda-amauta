import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "danger" | "warning" | "accent";
  children?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    danger: "text-destructive",
    warning: "text-warning-foreground",
    accent: "text-accent-foreground",
  }[tone];
  return (
    <div className="surface-card flex flex-col gap-2 p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

