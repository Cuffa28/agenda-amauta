import { useState } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/PageHeader";
import {
  clientsQuery,
  reviewsQuery,
  pendingsQuery,
  followUpsQuery,
  boardQuery,
} from "@/data/queries";
import { addDays, formatDate, todayInBuenosAires } from "@/domain/dates";
import { portfolioMonthStatus } from "@/domain/coverage";

export function WeeklyAgenda() {
  const today = todayInBuenosAires();
  const [start, setStart] = useState(() => {
    const day = new Date(today + "T12:00:00Z").getUTCDay();
    return addDays(today, -((day + 6) % 7));
  });
  const end = addDays(start, 6),
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [{ data: clients }, { data: reviews }, { data: pendings }, { data: followups }] =
    useSuspenseQueries({
      queries: [clientsQuery(), reviewsQuery(), pendingsQuery(), followUpsQuery()],
    });
  const months = [...new Set([start.slice(0, 7), end.slice(0, 7)])];
  const boards = useSuspenseQueries({ queries: months.map(boardQuery) }).flatMap((q) => q.data);
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const reviewItems = months.flatMap((month) =>
    clients
      .map((c) => portfolioMonthStatus(c, month, reviews, pendings, today, boards))
      .filter((s) => !s.countsAsReviewed && s.status !== "pausada")
      .map((s) => ({
        id: "review:" + s.clientId + s.month,
        date: s.dueDate,
        clientId: s.clientId,
        title: "Revisar cartera",
        kind: "Revisión mensual",
        time: "",
        month: s.month,
      })),
  );
  const pendingItems = pendings
    .filter((p) => p.status === "abierto")
    .map((p) => ({
      id: p.id,
      date: p.dueDate,
      clientId: p.clientId,
      title: p.description,
      kind: "Pendiente",
      time: "",
      month: p.dueDate.slice(0, 7),
    }));
  const eventItems = followups.map((f) => ({
    id: f.id,
    date: f.date,
    clientId: f.clientId,
    title: f.title,
    kind: f.calendarEventId ? "En Calendar" : "Bloque preparado",
    time: f.time,
    month: f.date.slice(0, 7),
  }));
  const items = [...reviewItems, ...pendingItems, ...eventItems];
  const overdue = items.filter(
    (i) => i.date && i.date < today && i.kind !== "En Calendar" && i.kind !== "Bloque preparado",
  );
  return (
    <SectionCard
      title="Mi semana"
      description="Revisiones, pendientes y bloques agendados en un solo lugar."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label="Semana anterior"
          onClick={() => setStart(addDays(start, -7))}
        >
          ←
        </Button>
        <span className="text-sm">
          {formatDate(start)} — {formatDate(end)}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Semana siguiente"
          onClick={() => setStart(addDays(start, 7))}
        >
          →
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const day = new Date(today + "T12:00:00Z").getUTCDay();
            setStart(addDays(today, -((day + 6) % 7)));
          }}
        >
          Esta semana
        </Button>
      </div>
      <div className="grid gap-4">
        {days.map((date) => {
          const own = items
            .filter((i) => i.date === date)
            .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
          return (
            <div key={date} className="border-t pt-3">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                {new Intl.DateTimeFormat("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(date + "T12:00:00Z"))}
                {date === today ? " · Hoy" : ""}
              </h3>
              {own.length ? (
                <ul className="space-y-2">
                  {own.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 text-sm">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">
                        {item.time || "—"}
                      </span>
                      <Link
                        to="/clientes/$clientId"
                        params={{ clientId: item.clientId }}
                        search={{ mes: item.month }}
                        className="min-w-0 hover:underline"
                      >
                        <span>{item.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {clientNames.get(item.clientId) || item.clientId} · {item.kind}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Sin tareas previstas</p>
              )}
            </div>
          );
        })}
      </div>
      {!!overdue.length && (
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm">
            Anteriores sin resolver · {overdue.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {overdue
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((item) => (
                <li key={item.id}>
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: item.clientId }}
                    search={{ mes: item.month }}
                    className="text-sm hover:underline"
                  >
                    {item.title} · {clientNames.get(item.clientId)}{" "}
                    <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      )}
    </SectionCard>
  );
}
