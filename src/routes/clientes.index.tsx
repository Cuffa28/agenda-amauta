import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/PageHeader";
import { DemoBadge, PORTFOLIO_STATUS_LABELS, PortfolioStatusBadge } from "@/components/status-badges";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { advisorsQuery, clientsQuery, pendingsQuery, reviewsQuery } from "@/data/queries";
import { portfolioMonthStatus, type PortfolioStatus } from "@/domain/coverage";
import { currentMonthInBuenosAires, formatDate, formatMonthLabel, todayInBuenosAires } from "@/domain/dates";
import { SEGMENTS } from "@/domain/schemas";
import { monthSearchSchema } from "@/lib/search";

export const Route = createFileRoute("/clientes/")({
  ssr: false,
  validateSearch: monthSearchSchema,
  head: () => ({
    meta: [
      { title: "Clientes · Agenda Amauta" },
      { name: "description", content: "Listado de carteras con estado de revisión mensual, asesor y pendientes." },
      { property: "og:title", content: "Clientes · Agenda Amauta" },
      { property: "og:description", content: "Carteras y estado de revisión del mes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

const ALL = "todos";

function ClientesPage() {
  const { mes } = Route.useSearch();
  const navigate = useNavigate({ from: "/clientes/" });
  const month = mes ?? currentMonthInBuenosAires();
  const today = todayInBuenosAires();
  const { data: clients } = useSuspenseQuery(clientsQuery());
  const { data: advisors } = useSuspenseQuery(advisorsQuery());
  const { data: reviews } = useSuspenseQuery(reviewsQuery());
  const { data: pendings } = useSuspenseQuery(pendingsQuery());
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState(ALL);
  const [advisorId, setAdvisorId] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const advisorById = useMemo(() => new Map(advisors.map((a) => [a.id, a])), [advisors]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients
      .map((c) => ({ client: c, status: portfolioMonthStatus(c, month, reviews, pendings, today) }))
      .filter(({ client, status: s }) => {
        if (needle && !client.id.includes(needle) && !client.name.toLowerCase().includes(needle)) return false;
        if (segment !== ALL && client.segment !== segment) return false;
        if (advisorId !== ALL && client.advisorId !== advisorId) return false;
        if (status !== ALL && s.status !== status) return false;
        return true;
      });
  }, [clients, reviews, pendings, month, today, q, segment, advisorId, status]);

  return (
    <>
      <PageHeader
        eyebrow={formatMonthLabel(month)}
        title="Clientes"
        description={`${rows.length} de ${clients.length} carteras`}
        actions={<MonthPicker value={month} onChange={(m) => navigate({ search: { mes: m } })} />}
      />

      <div className="surface-card mb-4 grid gap-3 p-4 md:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID o nombre" className="pl-8" aria-label="Buscar cliente" />
        </div>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger aria-label="Segmento"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los segmentos</SelectItem>
            {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={advisorId} onValueChange={setAdvisorId}>
          <SelectTrigger aria-label="Asesor"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los asesores</SelectItem>
            {advisors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {(Object.keys(PORTFOLIO_STATUS_LABELS) as PortfolioStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PORTFOLIO_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader className="bg-table-head">
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead className="hidden lg:table-cell">Sector</TableHead>
              <TableHead className="hidden md:table-cell">Asesor</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Pend.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ client, status: s }) => (
              <TableRow key={client.id}>
                <TableCell className="font-mono text-sm">{client.id}</TableCell>
                <TableCell>
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: client.id }}
                    search={{ mes: month }}
                    className="font-medium text-foreground hover:text-accent-foreground hover:underline"
                  >
                    {client.name}
                  </Link>
                  {client.isDemo && <span className="ml-2 align-middle"><DemoBadge /></span>}
                </TableCell>
                <TableCell>{client.segment}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{client.sector ?? "—"}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{advisorById.get(client.advisorId)?.name}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{formatDate(s.dueDate)}</TableCell>
                <TableCell><PortfolioStatusBadge status={s.status} overdue={s.isOverdue} /></TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{s.openPendings.length || "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Ningún cliente coincide con los filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

