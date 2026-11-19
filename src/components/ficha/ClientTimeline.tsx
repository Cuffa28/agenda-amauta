import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { getRepository } from "@/data";
import { recommendationsQuery } from "@/data/queries";
import { formatDateTime } from "@/domain/dates";
import type { AdvisorRequest } from "@/domain/request";
import type { Review } from "@/domain/schemas";
import type { Task } from "@/domain/task";
import {
  buildTimeline,
  TIMELINE_KINDS,
  TIMELINE_LABELS,
  type TimelineKind,
} from "@/domain/timeline";

const PAGE = 8;

/** Historial único del cliente, de lo más nuevo a lo más viejo, con filtro por tipo. */
export function ClientTimeline({
  clientId,
  reviews,
  requests,
  tasks,
}: {
  clientId: string;
  reviews: Review[];
  requests: AdvisorRequest[];
  tasks: Task[];
}) {
  const notebook = useQuery({
    queryKey: ["client-notebook", clientId],
    queryFn: () => getRepository().getClientNotebook(clientId),
  });
  const recs = useQuery(recommendationsQuery());
  const [filter, setFilter] = useState<TimelineKind | "todo">("todo");
  const [limit, setLimit] = useState(PAGE);
  const all = buildTimeline({
    clientId,
    reviews,
    notes: notebook.data?.notes ?? [],
    requests,
    tasks,
    recommendations: recs.data ?? [],
    contextUpdatedAt: notebook.data?.updatedAt,
  });
  const shown = all.filter((e) => filter === "todo" || e.kind === filter);
  const counts = new Map(TIMELINE_KINDS.map((k) => [k, all.filter((e) => e.kind === k).length]));
  return (
    <SectionCard title={`Historial · ${all.length}`}>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Filtrar historial">
        {(["todo", ...TIMELINE_KINDS] as const)
          .filter((k) => k === "todo" || counts.get(k))
          .map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              aria-pressed={filter === k}
              onClick={() => {
                setFilter(k);
                setLimit(PAGE);
              }}
            >
              {k === "todo" ? "Todo" : `${TIMELINE_LABELS[k]} · ${counts.get(k)}`}
            </Button>
          ))}
      </div>
      {notebook.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
      ) : (
        <ol className="grid gap-3">
          {shown.slice(0, limit).map((e) => (
            <li key={e.id} className="border-l-2 pl-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.at)} · {TIMELINE_LABELS[e.kind]}
              </p>
              <p className="font-medium">{e.title}</p>
              {e.body && (
                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{e.body}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {shown.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setLimit(limit + PAGE * 2)}
        >
          Ver más · {shown.length - limit}
        </Button>
      )}
    </SectionCard>
  );
}
