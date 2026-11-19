import { useState } from "react";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VISIBLE_STAGES,
  BOARD_LABELS,
  entryVersion,
  type BoardEntry,
  type BoardStage,
} from "@/domain/board";
import { useQueries } from "@tanstack/react-query";
import { boardQuery, clientsQuery, pendingsQuery, reviewsQuery } from "@/data/queries";
import { missedPreviousMonth } from "@/domain/coverage";
import { addDays, addMonths, formatDate, todayInBuenosAires } from "@/domain/dates";
import { nextMonthStart } from "@/domain/pause";
import type { Review } from "@/domain/schemas";

type MoveInput = {
  clientId: string;
  stage: BoardStage;
  entry?: BoardEntry | undefined;
  /** Solo al pausar: fecha de regreso (null = sin fecha). */
  until?: string | null;
};

export function useBoardMove(month: string) {
  return useRepoMutation(
    async (repo, input: MoveInput) => {
      // Pausar guarda la fecha de regreso en el cliente; salir de Pausada la retoma.
      if (input.stage === "pausada")
        await repo.pauseClient({ clientId: input.clientId, until: input.until ?? null });
      else if (input.entry?.pausedUntil !== undefined) await repo.resumeClient(input.clientId);
      return repo.moveBoardEntry({
        clientId: input.clientId,
        month,
        stage: input.stage,
        expectedUpdatedAt: entryVersion(input.entry),
      });
    },
    { success: "Estado guardado", invalidate: ["board", "pauses"] },
  );
}

/**
 * Cambio de estado desde tablero, lista o ficha. Pasar a Pausada pregunta
 * primero cuándo retomarla; el resto se guarda directo.
 */
export function useStageChange(month: string) {
  const move = useBoardMove(month);
  const [asking, setAsking] = useState<{
    clientId: string;
    name: string;
    entry?: BoardEntry | undefined;
  } | null>(null);
  const change = (input: {
    clientId: string;
    name: string;
    stage: BoardStage;
    entry?: BoardEntry | undefined;
  }) => {
    if (move.isPending) return;
    if (input.stage === "pausada") setAsking(input);
    else move.mutate(input);
  };
  const dialog = (
    <PauseDialog
      key={asking?.clientId ?? "none"}
      target={asking}
      busy={move.isPending}
      onCancel={() => setAsking(null)}
      onConfirm={(until) => {
        if (!asking) return;
        move.mutate(
          { clientId: asking.clientId, stage: "pausada", entry: asking.entry, until },
          { onSuccess: () => setAsking(null) },
        );
      }}
    />
  );
  return { move, change, dialog };
}

function PauseDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: { name: string } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (until: string | null) => void;
}) {
  const today = todayInBuenosAires();
  const next = nextMonthStart(today);
  const [choice, setChoice] = useState<"mes" | "fecha" | "sin">("mes");
  const [date, setDate] = useState("");
  const until = choice === "mes" ? next : choice === "fecha" ? date : null;
  const invalid = choice === "fecha" && (!date || date <= today);
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar {target?.name}</DialogTitle>
          <DialogDescription>
            ¿Cuándo la retomás? Ese día vuelve sola a Pendiente.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-3 text-sm">
          <legend className="sr-only">Fecha de regreso</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pause-until"
              checked={choice === "mes"}
              onChange={() => setChoice("mes")}
            />
            Próximo mes ({formatDate(next)})
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              name="pause-until"
              checked={choice === "fecha"}
              onChange={() => setChoice("fecha")}
            />
            Elegir fecha
            <input
              type="date"
              aria-label="Fecha de regreso"
              className="rounded-lg border bg-background px-2 py-1 text-sm"
              min={addDays(today, 1)}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setChoice("fecha");
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pause-until"
              checked={choice === "sin"}
              onChange={() => setChoice("sin")}
            />
            Sin fecha
          </label>
          {choice === "sin" && (
            <p className="text-xs text-muted-foreground">
              Va a quedar en Pausada hasta que la muevas a mano.
            </p>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(until)} disabled={busy || invalid}>
            Pausar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aclaración breve bajo el estado: hasta cuándo está pausada, si se retomó o si falta la conclusión. */
export function stageNote(
  stage: BoardStage,
  entry: BoardEntry | undefined,
  review: Review | null | undefined,
  missed?: string | null,
): { text: string; warn?: boolean } | null {
  if (stage === "pausada" && entry?.pausedUntil !== undefined)
    return entry.pausedUntil
      ? { text: `Hasta ${formatDate(entry.pausedUntil)}` }
      : { text: "Sin fecha de regreso", warn: true };
  if (stage !== "pausada" && entry?.resumedOn)
    return { text: `Retomada el ${formatDate(entry.resumedOn)}` };
  if (missed && stage === "pendiente")
    return { text: `Sin revisar en ${monthName(missed)}`, warn: true };
  if (stage === "pendiente" && review && review.status !== "cerrada")
    return { text: "Lectura guardada, sin decidir" };
  if (stage === "revisada" && !(review?.status === "cerrada" && review.decision))
    return { text: "Sin conclusión" };
  return null;
}

const monthName = (month: string) =>
  new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(
    new Date(month + "-15T12:00:00Z"),
  );

/**
 * Devuelve, por cliente, el mes anterior si quedó sin revisar teniendo una
 * revisión prevista. Usa consultas ya cacheadas; mientras cargan no marca nada.
 */
export function useMissedPrevious(month: string) {
  const [clients, reviews, pendings, board] = useQueries({
    queries: [clientsQuery(), reviewsQuery(), pendingsQuery(), boardQuery(addMonths(month, -1))],
  });
  const today = todayInBuenosAires();
  return (clientId: string): string | null => {
    if (!clients.data || !reviews.data || !pendings.data || !board.data) return null;
    const client = clients.data.find((c) => c.id === clientId);
    return client
      ? missedPreviousMonth(client, month, reviews.data, pendings.data, today, board.data)
      : null;
  };
}

export function StageNote(props: {
  stage: BoardStage;
  entry?: BoardEntry | undefined;
  review?: Review | null | undefined;
  missed?: string | null;
}) {
  const note = stageNote(props.stage, props.entry, props.review, props.missed);
  if (!note) return null;
  return (
    <span className={`text-xs ${note.warn ? "text-amber-700" : "text-muted-foreground"}`}>
      {note.text}
    </span>
  );
}

export function BoardStageSelect({
  value,
  disabled,
  onChange,
  label = "Estado de la tarjeta",
}: {
  value: BoardStage;
  disabled?: boolean;
  onChange: (value: BoardStage) => void;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      className="max-w-full rounded-lg border bg-background px-2 py-1.5 text-xs"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as BoardStage)}
    >
      {VISIBLE_STAGES.map((s) => (
        <option key={s} value={s}>
          {BOARD_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
