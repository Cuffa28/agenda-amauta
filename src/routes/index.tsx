import { useSuspenseQueries } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { KpiCard } from "@/components/KpiCard";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { PortfolioStatusBadge, UrgencyBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { advisorsQuery, clientsQuery, pendingsQuery, reviewsQuery } from "@/data/queries";
import { rankOpenPendings, summarizeMonth, URGENCY_ORDER, type PortfolioMonthStatus } from "@/domain/coverage";
import {
  currentMonthInBuenosAires,
  diffInDays,
  formatDate,
  formatDateLong,
  formatMonthLabel,
  todayInBuenosAires,
} from "@/domain/dates";
import { formatPercent } from "@/domain/format";
import { monthSearchSchema } from "@/lib/search";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: monthSearchSchema,
  head: () => ({
    meta: [
      { title: "Resumen · Agenda Amauta" },
      { name: "description", content: "Cobertura mensual, carteras de hoy, atrasadas y urgencia de pendientes." },
      { property: "og:title", content: "Resumen · Agenda Amauta" },
      { property: "og:description", content: "Tablero de revisión mensual de carteras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResumenPage,
});

function ResumenPage() {
  const { mes } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const month = mes ?? currentMonthInBuenosAires();
  const today = todayInBuenosAires();
  const [{ data: clients }, { data: advisors }, { data: reviews }, { data: pendings }] = useSuspenseQueries({
    queries: [clientsQuery(), advisorsQuery(), reviewsQuery(), pendingsQuery()],
  });
  const [showAllPendings, setShowAllPendings] = useState(false);

  const summary = useMemo(
    () => summarizeMonth(clients, reviews, pendings, month, today),
    [clients, reviews, pendings, month, today],
  );
  const ranked = useMemo(() => rankOpenPendings(pendings, today), [pendings, today]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const advisorById = useMemo(() => new Map(advisors.map((a) => [a.id, a])), [advisors]);
  const pendingsToday = ranked.items.filter((p) => p.urgency === "hoy");

  const byAdvisor = useMemo(
    () =>
      advisors.map((a) => {
        const rows = summary.statuses.filter((s) => clientById.get(s.clientId)?.advisorId === a.id);
        const reviewed = rows.filter((r) => r.countsAsReviewed).length;
        return {
          advisor: a,
          openPendings: pendings.filter(p=>p.status==="abierto"&&clientById.get(p.clientId)?.advisorId===a.id),
          total: rows.length,
          reviewed,
          overdue: rows.filter((r) => r.isOverdue).length,
          coverage: rows.length ? reviewed / rows.length : 0,
        };
      }),
    [advisors, summary, clientById, pendings],
  );

  const setMonth = (m: string) => navigate({ search: { mes: m } });

  return (
    <>
      <PageHeader
        eyebrow={`Revisión mensual · ${clients.length} carteras`}
        title="Resumen"
        description={<>Hoy: {formatDateLong(today)} · hora de Buenos Aires</>}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Cobertura · ${formatMonthLabel(month)}`}
          value={formatPercent(summary.coverage)}
          tone="accent"
          sub={
            <>
              {summary.reviewed} de {summary.total} revisadas
              {summary.reviewedWithOpenPending > 0 &&
                ` · incluye ${summary.reviewedWithOpenPending} con pendiente abierto`}
            </>
          }
        >
          <Progress value={summary.coverage * 100} className="h-1.5" aria-label="Cobertura mensual" />
        </KpiCard>
        <KpiCard
          label="Vencen hoy"
          value={summary.dueToday.length + pendingsToday.length}
          tone="warning"
          sub={`${summary.dueToday.length} carteras del mes · ${pendingsToday.length} pendientes`}
        />
        <KpiCard
          label="Carteras atrasadas"
          value={summary.overdue.length}
          tone={summary.overdue.length ? "danger" : "default"}
          sub={`${summary.inProgress} en curso en ${formatMonthLabel(month).toLowerCase()}`}
        />
        <KpiCard
          label="Pendientes abiertos"
          value={ranked.items.length}
          tone={ranked.counts.vencido ? "danger" : "default"}
          sub={`${ranked.counts.vencido} vencidos · ${ranked.counts.hoy} hoy · ${ranked.counts.proximos_7_dias} en 7 días`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Agenda de hoy"
          description={
            month === today.slice(0, 7)
              ? "Carteras que vencen hoy y pendientes con fecha de hoy."
              : `Las carteras de ${formatMonthLabel(month).toLowerCase()} no vencen hoy; se muestran los pendientes de hoy.`
          }
        >
          {summary.dueToday.length === 0 && pendingsToday.length === 0 ? (
            <Empty>Nada vence hoy.</Empty>
          ) : (
            <ul className="divide-y">
              {summary.dueToday.map((s) => (
                <li key={s.clientId} className="flex items-center justify-between gap-3 py-2.5">
                  <ClientLink id={s.clientId} name={clientById.get(s.clientId)?.name} month={month} />
                  <PortfolioStatusBadge status={s.status} overdue={s.isOverdue} />
                </li>
              ))}
              {pendingsToday.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <ClientLink id={p.clientId} name={clientById.get(p.clientId)?.name} />
                    <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                  </div>
                  <UrgencyBadge urgency={p.urgency} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Carteras atrasadas"
          description={`Sin revisión cerrada y con vencimiento anterior a hoy en ${formatMonthLabel(month).toLowerCase()}.`}
        >
          {summary.overdue.length === 0 ? (
            <Empty>No hay carteras atrasadas en este mes.</Empty>
          ) : (
            <OverdueTable rows={summary.overdue} today={today} month={month} clientById={clientById} advisorById={advisorById} />
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="mt-6"
        title="Urgencia de pendientes"
        description="Todos los pendientes abiertos, por fecha de vencimiento. Una cartera revisada con pendiente abierto ya cuenta como revisada; el pendiente conserva su vencimiento."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {URGENCY_ORDER.map((u) => (
            <div key={u} className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
              <UrgencyBadge urgency={u} />
              <span className="font-mono text-lg font-semibold tabular-nums">{ranked.counts[u]}</span>
            </div>
          ))}
        </div>
        {ranked.items.length === 0 ? (
          <Empty>No hay pendientes abiertos.</Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-table-head">
                  <TableRow>
                    <TableHead>Vence</TableHead>
                    <TableHead>Urgencia</TableHead>
                    <TableHead>Cartera</TableHead>
                    <TableHead className="hidden md:table-cell">Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllPendings ? ranked.items : ranked.items.slice(0, 10)).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap font-mono tabular-nums">
                        {formatDate(p.dueDate)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.daysFromToday === 0 ? "hoy" : p.daysFromToday < 0 ? `hace ${-p.daysFromToday} d` : `en ${p.daysFromToday} d`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <UrgencyBadge urgency={p.urgency} />
                      </TableCell>
                      <TableCell>
                        <ClientLink id={p.clientId} name={clientById.get(p.clientId)?.name} />
                      </TableCell>
                      <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                        {p.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {ranked.items.length > 10 && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAllPendings((v) => !v)}>
                {showAllPendings ? "Mostrar menos" : `Ver los ${ranked.items.length} pendientes`}
              </Button>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Cobertura por asesor" description={formatMonthLabel(month)}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-table-head">
              <TableRow>
                <TableHead>Asesor</TableHead>
                <TableHead className="text-right">Carteras</TableHead>
                <TableHead className="text-right">Revisadas</TableHead>
                <TableHead className="text-right">Atrasadas</TableHead>
                <TableHead>Pendientes del asesor</TableHead><TableHead className="w-48">Cobertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAdvisor.map((row) => (
                <TableRow key={row.advisor.id}>
                  <TableCell>
                    <div className="font-medium">{row.advisor.name}</div>
                    <div className="text-xs text-muted-foreground">{row.advisor.email}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.total}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.reviewed}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.overdue}</TableCell>
                  <TableCell><details><summary>{row.openPendings.length} abiertos</summary>{row.openPendings.map(p=><p className="mt-2 text-xs" key={p.id}><ClientLink id={p.clientId} name={clientById.get(p.clientId)?.name} month={month}/> · {p.description} · vence {formatDate(p.dueDate)}</p>)}</details></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={row.coverage * 100} className="h-1.5" />
                      <span className="w-10 text-right font-mono text-xs tabular-nums">{formatPercent(row.coverage)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

function OverdueTable({
  rows,
  today,
  month,
  clientById,
  advisorById,
}: {
  rows: PortfolioMonthStatus[];
  today: string;
  month: string;
  clientById: Map<string, { name: string; advisorId: string }>;
  advisorById: Map<string, { name: string }>;
}) {
  return (
    <div className="max-h-96 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-table-head">
          <TableRow>
            <TableHead>Cartera</TableHead>
            <TableHead>Venció</TableHead>
            <TableHead className="hidden sm:table-cell">Asesor</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            const client = clientById.get(s.clientId);
            return (
              <TableRow key={s.clientId}>
                <TableCell>
                  <ClientLink id={s.clientId} name={client?.name} month={month} />
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">
                  {formatDate(s.dueDate)}
                  <span className="ml-2 text-xs text-destructive">{diffInDays(s.dueDate, today)} d</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {client ? advisorById.get(client.advisorId)?.name : "—"}
                </TableCell>
                <TableCell>
                  <PortfolioStatusBadge status={s.status} overdue={s.isOverdue} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ClientLink({ id, name, month }: { id: string; name?: string | undefined; month?: string | undefined }) {
  return (
    <Link
      to="/clientes/$clientId"
      params={{ clientId: id }}
      search={{ mes: month }}
      className="group inline-flex min-w-0 items-baseline gap-2"
    >
      <span className="font-mono text-xs text-muted-foreground">{id}</span>
      <span className="truncate font-medium text-foreground group-hover:text-accent-foreground group-hover:underline">
        {name ?? "—"}
      </span>
    </Link>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

