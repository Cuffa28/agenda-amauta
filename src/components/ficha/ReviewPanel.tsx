import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cacheSavedReview } from "@/data/review-cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MarketView } from "@/data/repository";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { formatDate, formatDateTime } from "@/domain/dates";
import type { MarketViewSnapshot, Position, Review } from "@/domain/schemas";

/**
 * Datos de respaldo de la revisión del mes: qué visión de mercado quedó
 * congelada y qué posición se usó. La decisión y la lectura viven en "Mi revisión".
 */
export function ReviewSources({
  review,
  marketView,
  position = null,
}: {
  review: Review | null;
  marketView: MarketView;
  position?: Position | null;
}) {
  const queryClient = useQueryClient();
  const latest = marketView.versions[0];
  const attach = useRepoMutation((repo, id: string) => repo.setReviewPosition(review!.id, id), {
    success: "Posición vinculada a la revisión",
    invalidate: [],
    onSuccess: (saved) => cacheSavedReview(queryClient, saved),
  });
  if (!review)
    return (
      <p className="text-sm text-muted-foreground">Se completan al guardar la revisión del mes.</p>
    );
  return (
    <div className="grid gap-3 text-sm">
      <SnapshotBox snapshot={review.marketViewSnapshot} latestVersion={latest?.version} />
      {review.positionId && position?.id === review.positionId && (
        <p className="text-muted-foreground">
          Posición usada: al {formatDate(position.cutoffDate)}.
        </p>
      )}
      {review.status !== "cerrada" && position && position.id !== review.positionId && (
        <div className="rounded border p-3">
          <p>
            Hay una posición al {formatDate(position.cutoffDate)}. ¿La usás en esta revisión y en su
            borrador?
          </p>
          <Button
            className="mt-2"
            variant="outline"
            size="sm"
            disabled={attach.isPending}
            onClick={() => attach.mutate(position.id)}
          >
            {attach.isPending ? "Vinculando…" : "Usar esta posición"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SnapshotBox({
  snapshot,
  latestVersion,
}: {
  snapshot: MarketViewSnapshot | null;
  latestVersion?: number | undefined;
}) {
  if (!snapshot)
    return (
      <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        Visión de mercado opcional. Podés revisar esta cartera sin asociar una lectura de mercado.
      </p>
    );
  return (
    <div className="rounded-md border border-turquoise/40 bg-accent/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Lock className="h-3.5 w-3.5 text-accent-foreground" />
        <span className="font-semibold text-accent-foreground">Visión de mercado congelada</span>
        <Badge variant="outline" className="font-mono">
          v{snapshot.version}
        </Badge>
        <span className="text-muted-foreground">
          capturada {formatDateTime(snapshot.capturedAt)}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium">{snapshot.title}</div>
      <p className="text-sm text-muted-foreground">{snapshot.summary}</p>
      {latestVersion !== undefined && latestVersion > snapshot.version && (
        <p className="mt-2 text-xs text-muted-foreground">
          Existe una versión más nueva (v{latestVersion}). Esta revisión conserva la v
          {snapshot.version}.
        </p>
      )}
    </div>
  );
}
