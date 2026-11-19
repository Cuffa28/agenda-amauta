import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GripVertical } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { QuickReview } from "@/components/ficha/QuickReview";
import { ClientContextCard, ClientNotes } from "@/components/ficha/ClientNotebook";
import { PositionCard } from "@/components/ficha/PositionCard";
import {
  BoardStageSelect,
  StageNote,
  useMissedPrevious,
  useStageChange,
} from "@/components/BoardProgress";
import { RecommendationBadge, RecommendationTracker } from "@/components/RecommendationTracker";
import { positionsQuery } from "@/data/queries";
import {
  BOARD_STAGES,
  BOARD_LABELS,
  boardStage,
  type BoardEntry,
  type BoardStage,
} from "@/domain/board";
import { DECISION_LABELS } from "@/domain/decision";
import { formatDateTime } from "@/domain/dates";
import type { Client, Advisor, Review } from "@/domain/schemas";

export function PortfolioBoard({
  clients,
  advisors,
  reviews,
  entries,
  month,
}: {
  clients: Client[];
  advisors: Advisor[];
  reviews: Review[];
  entries: BoardEntry[];
  month: string;
}) {
  const [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState<BoardStage | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const { move, change, dialog } = useStageChange(month);
  const missed = useMissedPrevious(month);
  const gesture = useRef<{
    clientId: string;
    pointerId: number;
    x: number;
    y: number;
    active: boolean;
    target: BoardStage | null;
  } | null>(null);
  const clearDrag = () => {
    gesture.current = null;
    setDragged(null);
    setOver(null);
  };
  const entriesByClient = new Map(entries.map((e) => [e.clientId, e]));
  const reviewsByClient = new Map(
    reviews.filter((r) => r.month === month).map((r) => [r.clientId, r]),
  );
  const advisorsById = new Map(advisors.map((a) => [a.id, a]));
  const selectedClient = clients.find((c) => c.id === selected);
  const moveTo = (id: string, stage: BoardStage) => {
    if (move.isPending) return;
    const entry = entriesByClient.get(id);
    if (boardStage(reviewsByClient.get(id), entry) === stage) return;
    change({ clientId: id, name: clients.find((c) => c.id === id)?.name || id, stage, entry });
  };
  return (
    <>
      {dialog}
      <p className="mb-4 text-xs text-muted-foreground">
        Arrastrá desde el asa o elegí el estado en la tarjeta. Hacé clic en el nombre para ver el
        detalle.
      </p>
      {move.error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {move.error.message}
        </p>
      )}
      <div className="portfolio-board" aria-label="Tablero mensual de carteras">
        {BOARD_STAGES.map((stage) => {
          const cards = clients.filter(
            (c) => boardStage(reviewsByClient.get(c.id), entriesByClient.get(c.id)) === stage,
          );
          return (
            <section
              key={stage}
              aria-label={BOARD_LABELS[stage]}
              data-board-stage={stage}
              className={`board-column ${over === stage ? "board-column-over" : ""}`}
            >
              <header className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{BOARD_LABELS[stage]}</h2>
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </header>
              <div className="space-y-3">
                {cards.map((client) => {
                  const review = reviewsByClient.get(client.id),
                    entry = entriesByClient.get(client.id),
                    decision = review?.decision;
                  const note =
                    decision?.type === "mantener"
                      ? decision.nota
                      : decision?.type === "proponer_cambio"
                        ? decision.propuesta
                        : decision?.type === "falta_informacion"
                          ? decision.informacionFaltante
                          : review?.analysis;
                  const at =
                    entry && (!review?.closedAt || entry.updatedAt >= review.closedAt)
                      ? entry.updatedAt
                      : review?.closedAt;
                  return (
                    <article
                      key={client.id}
                      className={`board-card ${dragged === client.id ? "opacity-50" : ""}`}
                      aria-busy={move.isPending && move.variables?.clientId === client.id}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                          aria-label={`Arrastrar ${client.name}`}
                          style={{ touchAction: "none", userSelect: "none" }}
                          disabled={move.isPending}
                          onPointerDown={(e) => {
                            if (e.button !== 0 || move.isPending) return;
                            e.preventDefault();
                            gesture.current = {
                              clientId: client.id,
                              pointerId: e.pointerId,
                              x: e.clientX,
                              y: e.clientY,
                              active: false,
                              target: null,
                            };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            const g = gesture.current;
                            if (!g || g.pointerId !== e.pointerId) return;
                            if (!g.active && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6)
                              return;
                            if (!g.active) {
                              g.active = true;
                              setDragged(g.clientId);
                            }
                            const target = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest("[data-board-stage]")
                              ?.getAttribute("data-board-stage") as BoardStage | null;
                            g.target = target && BOARD_STAGES.includes(target) ? target : null;
                            setOver(g.target);
                          }}
                          onPointerUp={(e) => {
                            const g = gesture.current;
                            if (!g || g.pointerId !== e.pointerId) return;
                            if (g.active && g.target) moveTo(g.clientId, g.target);
                            clearDrag();
                            if (e.currentTarget.hasPointerCapture(e.pointerId))
                              e.currentTarget.releasePointerCapture(e.pointerId);
                          }}
                          onPointerCancel={clearDrag}
                          onLostPointerCapture={clearDrag}
                        >
                          <GripVertical size={16} />
                        </button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-sm font-semibold hover:underline"
                          onClick={() => setSelected(client.id)}
                        >
                          {client.name}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {advisorsById.get(client.advisorId)?.name || "Sin asesor"}
                      </p>
                      {decision && (
                        <span
                          className={`mt-3 inline-block rounded-md px-2 py-1 text-xs ${decision.type === "mantener" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                        >
                          {DECISION_LABELS[decision.type]}
                        </span>
                      )}
                      <RecommendationBadge review={review} />
                      {note && (
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {note}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <BoardStageSelect
                          value={stage}
                          disabled={move.isPending}
                          label={`Estado de ${client.name}`}
                          onChange={(value) => moveTo(client.id, value)}
                        />
                        <StageNote
                          stage={stage}
                          entry={entry}
                          review={review}
                          missed={missed(client.id)}
                        />
                      </div>
                      {at && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {entry && entry.updatedAt === at ? "Movida" : "Revisión"} ·{" "}
                          {formatDateTime(at)}
                        </p>
                      )}
                    </article>
                  );
                })}
                {!cards.length && (
                  <p className="py-8 text-center text-xs text-muted-foreground">Sin carteras</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Sheet
        open={!!selectedClient}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedClient && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedClient.name}</SheetTitle>
                <SheetDescription>
                  {advisorsById.get(selectedClient.advisorId)?.name || "Sin asesor"} · Revisión
                  mensual
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5 grid gap-5">
                <div className="flex items-center justify-between gap-3">
                  <BoardStageSelect
                    value={boardStage(
                      reviewsByClient.get(selectedClient.id),
                      entriesByClient.get(selectedClient.id),
                    )}
                    disabled={move.isPending}
                    onChange={(value) => moveTo(selectedClient.id, value)}
                  />
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to="/clientes/$clientId"
                      params={{ clientId: selectedClient.id }}
                      search={{ mes: month }}
                    >
                      Abrir ficha completa
                    </Link>
                  </Button>
                </div>
                <QuickReview
                  key={
                    selectedClient.id +
                    month +
                    (reviewsByClient.get(selectedClient.id)?.status || "")
                  }
                  clientId={selectedClient.id}
                  month={month}
                  review={reviewsByClient.get(selectedClient.id) || null}
                  progress={boardStage(
                    reviewsByClient.get(selectedClient.id),
                    entriesByClient.get(selectedClient.id),
                  )}
                />
                <RecommendationTracker review={reviewsByClient.get(selectedClient.id)} />
                <ClientContextCard client={selectedClient} />
                <ClientNotes clientId={selectedClient.id} />
                <details>
                  <summary className="cursor-pointer text-sm">Ver cartera y PDF</summary>
                  <BoardPosition clientId={selectedClient.id} />
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
function BoardPosition({ clientId }: { clientId: string }) {
  const query = useQuery(positionsQuery(clientId));
  return query.isPending ? (
    <p className="mt-3 text-sm">Cargando cartera…</p>
  ) : query.error ? (
    <p role="alert">No se pudo cargar la cartera.</p>
  ) : (
    <div className="mt-3">
      <PositionCard position={query.data[0] || null} />
    </div>
  );
}
