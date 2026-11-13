import { CheckCircle2, Plus } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/Field";
import { SectionCard } from "@/components/PageHeader";
import { UrgencyBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { pendingUrgency } from "@/domain/coverage";
import { addDays, formatDate, formatMonthLabel } from "@/domain/dates";
import { issuesToFieldErrors, pendingInputSchema, PENDING_ORIGINS, type PendingInput, type PendingItem, type Review } from "@/domain/schemas";

const ORIGIN_LABELS: Record<(typeof PENDING_ORIGINS)[number], string> = {
  falta_informacion: "Falta información",
  propuesta: "Propuesta",
  manual: "Manual",
};

export function PendingsPanel({
  clientId,
  review,
  pendings,
  reviewsById,
  today,
}: {
  clientId: string;
  review: Review | null;
  pendings: PendingItem[];
  reviewsById: Map<string, Review>;
  today: string;
}) {
  const open = pendings.filter((p) => p.status === "abierto").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const resolved = pendings.filter((p) => p.status === "resuelto").sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const [showResolved, setShowResolved] = useState(false);
  const resolve = useRepoMutation((repo, id: string) => repo.resolvePending(id), { invalidate: ["pendings"], success: "Pendiente resuelto" });

  return (
    <SectionCard title="Pendientes" description={`${open.length} abiertos`}>
      {open.length === 0 && <p className="text-sm text-muted-foreground">Sin pendientes abiertos.</p>}
      <ul className="grid gap-2">
        {open.map((p) => (
          <li key={p.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{p.description}</p>
              <UrgencyBadge urgency={pendingUrgency(p.dueDate, today)} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Vence <span className="font-mono">{formatDate(p.dueDate)}</span> · {ORIGIN_LABELS[p.origin]} · revisión{" "}
                {formatMonthLabel(reviewsById.get(p.reviewId)?.month ?? "").toLowerCase()}
              </span>
              <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate(p.id)}>
                <CheckCircle2 />
                Resolver
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {review ? (
        <NewPendingForm clientId={clientId} review={review} today={today} />
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Iniciá la revisión del mes para registrar pendientes ligados a ella.</p>
      )}

      {resolved.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Ocultar" : "Ver"} {resolved.length} resueltos
          </Button>
          {showResolved && (
            <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
              {resolved.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.description}</span>
                  <Badge variant="muted">Resuelto</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function NewPendingForm({ clientId, review, today }: { clientId: string; review: Review; today: string }) {
  const [openForm, setOpenForm] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(addDays(today, 7));
  const [origin, setOrigin] = useState<PendingInput["origin"]>("manual");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useRepoMutation((repo, input: PendingInput) => repo.createPending(input), {
    invalidate: ["pendings"], success: "Pendiente registrado",
    onSuccess: () => {
      setDescription("");
      setOpenForm(false);
    },
  });

  if (!openForm) {
    return (
      <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpenForm(true)}>
        <Plus />
        Nuevo pendiente
      </Button>
    );
  }

  const submit = () => {
    const parsed = pendingInputSchema.safeParse({ clientId, reviewId: review.id, origin, description, dueDate });
    if (!parsed.success) return setErrors(issuesToFieldErrors(parsed.error));
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <div className="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3">
      <Field label="Descripción" htmlFor="pd" error={errors["description"]}>
        <Input id="pd" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vence" htmlFor="pdd" error={errors["dueDate"]}>
          <Input id="pdd" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Origen">
          <Select value={origin} onValueChange={(v) => setOrigin(v as PendingInput["origin"])}>
            <SelectTrigger aria-label="Origen"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PENDING_ORIGINS.map((o) => <SelectItem key={o} value={o}>{ORIGIN_LABELS[o]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Ligado a la revisión de {formatMonthLabel(review.month).toLowerCase()}.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={create.isPending}>Guardar</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpenForm(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

