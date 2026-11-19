import { BOARD_LABELS, type BoardStage } from "@/domain/board";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getRepository } from "@/data";
import { cacheSavedReview } from "@/data/review-cache";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { DECISION_LABELS } from "@/domain/decision";
import {
  addDays,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  todayInBuenosAires,
} from "@/domain/dates";
import type { ClientNotebook } from "@/domain/client-notebook";
import type { Decision, DecisionType, Review } from "@/domain/schemas";

const CHOICE_HINTS: Record<DecisionType, string> = {
  mantener: "Conservo la estrategia.",
  proponer_cambio: "Le propongo un cambio al asesor.",
  falta_informacion: "Me falta un dato para decidir.",
};

/**
 * Mi revisión del mes, en un solo lugar: una decisión y un único texto
 * ("Mi lectura"). Los campos extra aparecen solo cuando hacen falta.
 * Horizonte y liquidez no se vuelven a escribir: se leen del Contexto.
 */
export function QuickReview({
  clientId,
  month,
  review,
  progress,
  previous,
}: {
  clientId: string;
  month: string;
  review: Review | null;
  progress?: BoardStage;
  /** Conclusión de la revisión anterior, para tenerla a la vista. */
  previous?: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const notebook = useQuery({
    queryKey: ["client-notebook", clientId],
    queryFn: () => getRepository().getClientNotebook(clientId),
    retry: false,
  });
  const context = (notebook.data as ClientNotebook | undefined)?.context;
  const old = review?.decision ?? null;
  const [choice, setChoice] = useState<DecisionType | null>(old?.type ?? null);
  // Una revisión vieja podía tener la nota en la decisión: se junta en "Mi lectura".
  const [reading, setReading] = useState(
    review?.analysis || (old?.type === "mantener" ? old.nota : ""),
  );
  const [proposal, setProposal] = useState(old?.type === "proponer_cambio" ? old.propuesta : "");
  const [toValidate, setToValidate] = useState(
    old?.type === "proponer_cambio" ? (old.queValidar ?? "") : "",
  );
  const [reconsider, setReconsider] = useState(
    old?.type === "proponer_cambio" ? old.datoReconsiderar : "",
  );
  const [missing, setMissing] = useState(
    old?.type === "falta_informacion" ? old.informacionFaltante : "",
  );
  const [deadline, setDeadline] = useState(
    old?.type === "falta_informacion" ? old.fechaLimite : addDays(todayInBuenosAires(), 7),
  );
  const [error, setError] = useState("");

  const toDecision = (): Decision | null => {
    if (choice === "mantener") return { type: "mantener", nota: "" };
    if (choice === "proponer_cambio") {
      if (toValidate.trim() && toValidate.trim().length < 5) {
        setError("Contá un poco más qué tiene que validar el asesor, o dejalo vacío.");
        return null;
      }
      return {
        type: "proponer_cambio",
        propuesta: proposal.trim(),
        fundamentoHorizonte:
          context?.horizon || (old?.type === "proponer_cambio" ? old.fundamentoHorizonte : ""),
        fundamentoLiquidez:
          context?.liquidity || (old?.type === "proponer_cambio" ? old.fundamentoLiquidez : ""),
        datoReconsiderar: reconsider.trim(),
        validacionAsesor: old?.type === "proponer_cambio" ? old.validacionAsesor : "pendiente",
        ...(toValidate.trim() ? { queValidar: toValidate.trim() } : {}),
      };
    }
    if (choice === "falta_informacion") {
      if (missing.trim().length < 5) {
        setError("Escribí qué información falta.");
        return null;
      }
      return {
        type: "falta_informacion",
        informacionFaltante: missing.trim(),
        fechaLimite: deadline,
      };
    }
    return null;
  };

  const save = useRepoMutation(
    async (repo, v: { decision: Decision | null; close: boolean }) => {
      let current = review ?? (await repo.startReview({ clientId, month }));
      if (reading.trim() !== (current.analysis || "").trim())
        current = await repo.saveReviewAnalysis(current.id, reading.trim());
      if (v.decision) current = await repo.saveDecision(current.id, v.decision);
      return v.close ? repo.closeReview(current.id) : current;
    },
    {
      success: "Revisión guardada",
      invalidate: [],
      onSuccess: (r) => cacheSavedReview(queryClient, r),
    },
  );
  const submit = (close: boolean) => {
    setError("");
    const decision = choice ? toDecision() : null;
    if (choice && !decision) return;
    save.mutate({ decision, close });
  };

  const closed = review?.status === "cerrada";
  return (
    <SectionCard title={`Mi revisión · ${formatMonthLabel(month)}`}>
      {previous && (
        <p className="mb-3 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">La vez anterior:</span> {previous}
        </p>
      )}
      {closed && review.decision ? (
        <ClosedReview review={review} decision={review.decision} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {progress ? BOARD_LABELS[progress] : "Sin revisar"}
            {review?.analysis ? " · tenés tu lectura guardada" : ""}
          </p>
          <div role="group" aria-label="Resultado de mi revisión" className="flex flex-wrap gap-2">
            {(["mantener", "proponer_cambio", "falta_informacion"] as const).map((type) => (
              <Button
                key={type}
                variant={choice === type ? "default" : "outline"}
                aria-pressed={choice === type}
                title={CHOICE_HINTS[type]}
                disabled={save.isPending}
                onClick={() => setChoice(choice === type ? null : type)}
              >
                {DECISION_LABELS[type]}
              </Button>
            ))}
          </div>
          <label className="block space-y-1 text-sm">
            <span>
              Mi lectura <span className="text-muted-foreground">· opcional, solo para vos</span>
            </span>
            <Textarea
              rows={3}
              maxLength={8000}
              value={reading}
              disabled={save.isPending}
              onChange={(e) => setReading(e.target.value)}
              placeholder="Qué vi en la cartera, qué cambió y qué me preocupa."
            />
          </label>

          {choice === "proponer_cambio" && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="block space-y-1 text-sm">
                <span>
                  Qué cambiaría{" "}
                  <span className="text-muted-foreground">· va al borrador para el asesor</span>
                </span>
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={proposal}
                  disabled={save.isPending}
                  onChange={(e) => setProposal(e.target.value)}
                  placeholder="Reducir…, sumar…, mantener… Lo propongo porque…"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>
                  Qué tiene que validar el asesor{" "}
                  <span className="text-muted-foreground">· opcional</span>
                </span>
                <Input
                  maxLength={1000}
                  value={toValidate}
                  disabled={save.isPending}
                  onChange={(e) => setToValidate(e.target.value)}
                  placeholder="Necesidades del cliente, restricciones, aceptación."
                />
              </label>
              <ContextHint horizon={context?.horizon} liquidity={context?.liquidity} />
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Más detalle (opcional)
                </summary>
                <label className="mt-2 block space-y-1">
                  <span>Dato que me haría reconsiderar</span>
                  <Input
                    maxLength={500}
                    value={reconsider}
                    disabled={save.isPending}
                    onChange={(e) => setReconsider(e.target.value)}
                  />
                </label>
              </details>
            </div>
          )}

          {choice === "falta_informacion" && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_11rem]">
              <label className="block space-y-1 text-sm">
                <span>Qué información falta</span>
                <Input
                  maxLength={1000}
                  value={missing}
                  disabled={save.isPending}
                  onChange={(e) => setMissing(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Para cuándo</span>
                <Input
                  type="date"
                  value={deadline}
                  disabled={save.isPending}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Al guardar se crea un pendiente con esa fecha.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={!choice || save.isPending} onClick={() => submit(true)}>
              {save.isPending ? "Guardando…" : "Guardar revisión"}
            </Button>
            <Button
              variant="ghost"
              disabled={save.isPending || (!reading.trim() && !choice)}
              onClick={() => submit(false)}
            >
              Guardar sin cerrar
            </Button>
          </div>
          {!choice && (
            <p className="text-xs text-muted-foreground">
              Elegí una decisión para cerrar la revisión. Si todavía no decidiste, podés guardar tu
              lectura sin cerrar.
            </p>
          )}
          {(error || save.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error || save.error?.message}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ContextHint({
  horizon,
  liquidity,
}: {
  horizon?: string | undefined;
  liquidity?: string | undefined;
}) {
  if (!horizon && !liquidity)
    return (
      <p className="text-xs text-muted-foreground">
        Horizonte y liquidez se toman del Contexto del cliente (arriba). Todavía no están cargados.
      </p>
    );
  return (
    <p className="text-xs text-muted-foreground">
      Del Contexto: {horizon ? `horizonte ${horizon}` : "horizonte sin cargar"} ·{" "}
      {liquidity ? `liquidez ${liquidity}` : "liquidez sin cargar"}.
    </p>
  );
}

function ClosedReview({ review, decision }: { review: Review; decision: Decision }) {
  const rows: [string, string][] = [];
  if (decision.type === "mantener" && decision.nota) rows.push(["Nota", decision.nota]);
  if (decision.type === "proponer_cambio")
    rows.push(
      ["Qué cambiaría", decision.propuesta],
      ["Qué tiene que validar el asesor", decision.queValidar ?? ""],
      ["Dato que me haría reconsiderar", decision.datoReconsiderar],
    );
  if (decision.type === "falta_informacion")
    rows.push(
      ["Qué falta", decision.informacionFaltante],
      ["Para cuándo", formatDate(decision.fechaLimite)],
    );
  return (
    <div className="space-y-3">
      <p className="font-semibold">
        {DECISION_LABELS[decision.type]}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {formatDateTime(review.closedAt || review.startedAt)}
        </span>
      </p>
      {review.analysis && (
        <div>
          <p className="text-xs text-muted-foreground">Mi lectura</p>
          <p className="whitespace-pre-wrap text-sm">{review.analysis}</p>
        </div>
      )}
      {rows
        .filter(([, v]) => v.trim())
        .map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="whitespace-pre-wrap text-sm">{v}</p>
          </div>
        ))}
      {decision.type === "proponer_cambio" && (
        <p className="text-xs text-muted-foreground">
          Recomendación registrada · no implica ejecución.
        </p>
      )}
    </div>
  );
}
