import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cacheSavedReview } from "@/data/review-cache";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { DECISION_LABELS } from "@/domain/decision";
import { formatDateTime, formatMonthLabel } from "@/domain/dates";
import type { Decision, Review } from "@/domain/schemas";

export function QuickReview({
  clientId,
  month,
  review,
}: {
  clientId: string;
  month: string;
  review: Review | null;
}) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<"mantener" | "proponer_cambio" | null>(
    review?.decision?.type === "mantener" || review?.decision?.type === "proponer_cambio"
      ? review.decision.type
      : null,
  );
  const [note, setNote] = useState(
    review?.decision?.type === "mantener"
      ? review.decision.nota
      : review?.decision?.type === "proponer_cambio"
        ? review.decision.propuesta
        : "",
  );
  const save = useRepoMutation(
    async (repo, decision: Decision) => {
      const current = review ?? (await repo.startReview({ clientId, month }));
      await repo.saveDecision(current.id, decision);
      return repo.closeReview(current.id);
    },
    {
      success: "Revisión guardada",
      invalidate: [],
      onSuccess: (r) => cacheSavedReview(queryClient, r),
    },
  );
  const closed = review?.status === "cerrada";
  return (
    <SectionCard title={`Mi revisión · ${formatMonthLabel(month)}`}>
      {closed && review.decision ? (
        <div className="space-y-2">
          <p className="font-semibold">
            {DECISION_LABELS[review.decision.type]}{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {formatDateTime(review.closedAt || review.startedAt)}
            </span>
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {review.decision.type === "mantener"
              ? review.decision.nota
              : review.decision.type === "proponer_cambio"
                ? review.decision.propuesta
                : review.decision.informacionFaltante}
          </p>
          {review.decision.type === "proponer_cambio" && (
            <p className="text-xs text-muted-foreground">
              Recomendación registrada · no implica ejecución.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sin revisar{review?.analysis ? " · tenés notas de trabajo guardadas" : ""}
          </p>
          <div role="group" aria-label="Resultado de mi revisión" className="flex flex-wrap gap-2">
            {(["mantener", "proponer_cambio"] as const).map((type) => (
              <Button
                key={type}
                variant={choice === type ? "default" : "outline"}
                aria-pressed={choice === type}
                disabled={save.isPending}
                onClick={() => setChoice(type)}
              >
                {DECISION_LABELS[type]}
              </Button>
            ))}
          </div>
          <label className="block space-y-2 text-sm">
            <span>
              Nota <span className="text-muted-foreground">· opcional</span>
            </span>
            <Textarea
              rows={3}
              maxLength={choice === "mantener" ? 280 : 2000}
              value={note}
              disabled={save.isPending}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Qué viste, qué cambiarías o qué querés recordar."
            />
          </label>
          <Button
            disabled={!choice || save.isPending}
            onClick={() => {
              if (!choice) return;
              const old = review?.decision;
              save.mutate(
                choice === "mantener"
                  ? { type: choice, nota: note }
                  : {
                      type: choice,
                      propuesta: note,
                      fundamentoHorizonte:
                        old?.type === "proponer_cambio" ? old.fundamentoHorizonte : "",
                      fundamentoLiquidez:
                        old?.type === "proponer_cambio" ? old.fundamentoLiquidez : "",
                      datoReconsiderar: old?.type === "proponer_cambio" ? old.datoReconsiderar : "",
                      validacionAsesor:
                        old?.type === "proponer_cambio" ? old.validacionAsesor : "pendiente",
                      ...(old?.type === "proponer_cambio" && old.queValidar
                        ? { queValidar: old.queValidar }
                        : {}),
                    },
              );
            }}
          >
            {save.isPending ? "Guardando…" : "Guardar revisión"}
          </Button>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
