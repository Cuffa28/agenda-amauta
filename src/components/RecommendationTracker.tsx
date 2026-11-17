import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recommendationsQuery } from "@/data/queries";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { formatDate } from "@/domain/dates";
import {
  RECOMMENDATION_LABELS,
  recommendationStatus,
  type RecommendationState,
} from "@/domain/recommendation";
import type { Review } from "@/domain/schemas";

/** Etiqueta breve para la tarjeta del tablero. */
export function RecommendationBadge({ review }: { review: Review | null | undefined }) {
  const { data: records = [] } = useQuery(recommendationsQuery());
  const status = recommendationStatus(review, records);
  if (!status) return null;
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {RECOMMENDATION_LABELS[status.state]} · {formatDate(status.since)}
    </p>
  );
}

/**
 * Seguimiento de una recomendación de cambio: esperando asesor → validada /
 * descartada. Solo registra la respuesta del asesor; no envía nada.
 */
export function RecommendationTracker({ review }: { review: Review | null | undefined }) {
  const { data: records = [] } = useQuery(recommendationsQuery());
  const [note, setNote] = useState("");
  const save = useRepoMutation(
    (repo, state: RecommendationState) =>
      repo.saveRecommendationState({ reviewId: review!.id, state, note }),
    {
      success: "Seguimiento guardado",
      invalidate: ["recommendations"],
      onSuccess: () => setNote(""),
    },
  );
  const status = recommendationStatus(review, records);
  if (!status) return null;
  const next: RecommendationState[] =
    status.state === "esperando" ? ["validada", "descartada"] : ["esperando"];
  return (
    <section className="rounded-lg border p-3 text-sm" aria-label="Seguimiento con el asesor">
      <p className="text-xs text-muted-foreground">Seguimiento con el asesor</p>
      <p className="mt-1">
        <strong>{RECOMMENDATION_LABELS[status.state]}</strong> · desde {formatDate(status.since)}
      </p>
      {status.note && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{status.note}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota (opcional)"
          aria-label="Nota del seguimiento"
          className="h-8 max-w-xs text-xs"
          maxLength={500}
        />
        {next.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "validada" ? "default" : "outline"}
            disabled={save.isPending}
            onClick={() => save.mutate(s)}
          >
            {s === "esperando" ? "Volver a esperando" : RECOMMENDATION_LABELS[s]}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Registra la respuesta del asesor. No implica aceptación del cliente ni ejecución.
      </p>
    </section>
  );
}
