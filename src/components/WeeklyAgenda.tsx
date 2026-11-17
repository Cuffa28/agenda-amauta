import { useState } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/PageHeader";
import { QuickCapture, TaskRow } from "@/components/Tasks";
import {
  clientsQuery,
  reviewsQuery,
  pendingsQuery,
  followUpsQuery,
  boardQuery,
  pausesQuery,
  tasksQuery,
  recommendationsQuery,
} from "@/data/queries";
import { addDays, formatDate, todayInBuenosAires } from "@/domain/dates";
import { portfolioMonthStatus } from "@/domain/coverage";
import { waitingRecommendations } from "@/domain/recommendation";
import type { Task } from "@/domain/task";

interface AgendaItem {
  id: string;
  date: string;
  clientId: string | null;
  title: string;
  kind: string;
  time: string;
  month: string;
  task?: Task;
}

/** Tipos que no cuentan como "sin resolver" cuando la fecha ya pasó. */
const NOT_OVERDUE = new Set(["En Calendar", "Bloque preparado", "Retomar"]);

export function WeeklyAgenda() {
  const today = todayInBuenosAires();
  const [start, setStart] = useState(() => {
    const day = new Date(today + "T12:00:00Z").getUTCDay();
    return addDays(today, -((day + 6) % 7));
  });
  const end = addDays(start, 6),
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [
    { data: clients },
    { data: reviews },
    { data: pendings },
    { data: followups },
    { data: pauses },
    { data: tasks },
    { data: recommendations },
  ] = useSuspenseQueries({
    queries: [
      clientsQuery(),
      reviewsQuery(),
      pendingsQuery(),
      followUpsQuery(),
      pausesQuery(),
      tasksQuery(),
      recommendationsQuery(),
    ],
  });
  const months = [...new Set([start.slice(0, 7), end.slice(0, 7)])];
  const boards = useSuspenseQueries({ queries: months.map(boardQuery) }).flatMap((q) => q.data);
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const reviewItems: AgendaItem[] = months.flatMap((month) =>
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
  const pendingItems: AgendaItem[] = pendings
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
  const eventItems: AgendaItem[] = followups.map((f) => ({
    id: f.id,
    date: f.date,
    clientId: f.clientId,
    title: f.title,
    kind: f.calendarEventId ? "En Calendar" : "Bloque preparado",
    time: f.time,
    month: f.date.slice(0, 7),
  }));
  // El día de regreso de una pausa aparece en la semana como aviso.
  const resumeItems: AgendaItem[] = pauses
    .filter((p) => !p.endedOn && p.until && p.until >= start && p.until <= end)
    .map((p) => ({
      id: "pausa:" + p.clientId,
      date: p.until!,
      clientId: p.clientId,
      title: "Vuelve de la pausa",
      kind: "Retomar",
      time: "",
      month: p.until!.slice(0, 7),
    }));
  // Seguimiento interno: recomendación sin respuesta del asesor tras 5 días. No se envía nada.
  const recommendationItems: AgendaItem[] = waitingRecommendations(reviews, recommendations).map(
    (r) => ({
      id: "rec:" + r.reviewId,
      date: r.dueDate,
      clientId: r.clientId,
      title: "Recomendación sin respuesta del asesor",
      kind: "Seguimiento interno",
      time: "",
      month: r.month,
    }),
  );
  const openTasks = tasks.filter((t) => t.status === "abierta");
  const taskItems: AgendaItem[] = openTasks
    .filter((t) => t.dueDate)
    .map((t) => ({
      id: "task:" + t.id,
      date: t.dueDate!,
      clientId: t.clientId,
      title: t.title,
      kind: "Tarea",
      time: "",
      month: t.dueDate!.slice(0, 7),
      task: t,
    }));
  const undated = openTasks
    .filter((t) => !t.dueDate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recentlyClosed = tasks
    .filter(
      (t) => t.status !== "abierta" && t.closedAt && t.closedAt.slice(0, 10) >= addDays(today, -30),
    )
    .sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""));
  const items = [
    ...reviewItems,
    ...pendingItems,
    ...eventItems,
    ...resumeItems,
    ...recommendationItems,
    ...taskItems,
  ];
  const overdue = items.filter((i) => i.date && i.date < today && !NOT_OVERDUE.has(i.kind));
  const renderItem = (item: AgendaItem, withDate = false) =>
    item.task ? (
      <TaskRow
        task={item.task}
        clientName={item.clientId ? clientNames.get(item.clientId) : undefined}
      />
    ) : (
      <Link
        to="/clientes/$clientId"
        params={{ clientId: item.clientId! }}
        search={{ mes: item.month }}
        className="min-w-0 hover:underline"
      >
        <span>{item.title}</span>
        <span className="block text-xs text-muted-foreground">
          {clientNames.get(item.clientId!) || item.clientId} · {item.kind}
          {withDate ? ` · ${formatDate(item.date)}` : ""}
        </span>
      </Link>
    );
  return (
    <SectionCard
      title="Mi semana"
      description="Revisiones, pendientes, tareas y bloques agendados en un solo lugar."
    >
      <QuickCapture clients={clients} />
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
                      {renderItem(item)}
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
                <li key={item.id} className="flex text-sm">
                  {renderItem(item, true)}
                </li>
              ))}
          </ul>
        </details>
      )}
      {!!undated.length && (
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm">Sin fecha · {undated.length}</summary>
          <ul className="mt-3 space-y-2">
            {undated.map((t) => (
              <li key={t.id} className="flex text-sm">
                <TaskRow
                  task={t}
                  clientName={t.clientId ? clientNames.get(t.clientId) : undefined}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!recentlyClosed.length && (
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Hechas y quitadas · últimos 30 días · {recentlyClosed.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {recentlyClosed.map((t) => (
              <li key={t.id} className="flex text-sm">
                <TaskRow
                  task={t}
                  clientName={t.clientId ? clientNames.get(t.clientId) : undefined}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </SectionCard>
  );
}
