import { Lock, PlayCircle, LoaderCircle } from "lucide-react";
import { useQueryClient } from '@tanstack/react-query';
import { cacheSavedReview, removeCancelledReview } from '@/data/review-cache';
import { useState } from "react";

import { Field } from "@/components/Field";
import { SectionCard } from "@/components/PageHeader";
import { PortfolioStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MarketView } from "@/data/repository";
import { useRepoMutation } from "@/data/use-repo-mutation";
import type { PortfolioMonthStatus } from "@/domain/coverage";
import { addDays, formatDate, formatDateTime, formatMonthLabel, todayInBuenosAires } from "@/domain/dates";
import { ADVISOR_VALIDATION_LABELS, DECISION_LABELS } from "@/domain/decision";
import {
  ADVISOR_VALIDATIONS,
  DECISION_TYPES,
  decisionSchema,
  issuesToFieldErrors,
  type AdvisorValidation,
  type Decision,
  type DecisionType,
  type MarketViewSnapshot,
  type Review,
  type Position,
} from "@/domain/schemas";

export function ReviewPanel({
  clientId,
  month,
  status,
  marketView,
  position = null,
}: {
  clientId: string;
  month: string;
  status: PortfolioMonthStatus;
  marketView: MarketView;
  position?: Position | null;
}) {
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const review = status.review;
  const queryClient = useQueryClient();
  const latest = marketView.versions[0];
  const attachPosition = useRepoMutation((repo, id: string) => repo.setReviewPosition(review!.id, id), {
    success: 'Posición vinculada a la revisión', invalidate: [], onSuccess: saved => cacheSavedReview(queryClient, saved),
  });
  const start = useRepoMutation((repo, _: void) => repo.startReview({ clientId, month }), {
    success: "Revisión iniciada",
    invalidate: [],
    onSuccess: saved => cacheSavedReview(queryClient, saved),
  });

  if (!review) {
    return (
      <SectionCard
        title={`Revisión de ${formatMonthLabel(month).toLowerCase()}`}
        actions={<PortfolioStatusBadge status={status.status} overdue={status.isOverdue} />}
      >
        <p className="text-sm text-muted-foreground">
          {status.dueDate ? `Vence el ${formatDate(status.dueDate)}.` : 'Podés empezar aunque todavía no tenga un día mensual asignado.'}
          {' '}Registrá tu decisión, prepará el correo y agendá lo que quede pendiente.
          {latest && <> Se conservará tu visión de mercado v{latest.version}.</>}
        </p>
        <Button className="mt-4" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? <LoaderCircle className="animate-spin" /> : <PlayCircle />}
          {start.isPending ? 'Iniciando…' : 'Iniciar revisión'}
        </Button>
        {start.error && <p role="alert" className="mt-3 text-sm text-destructive">{start.error.message} Podés volver a intentar sin duplicar la revisión.</p>}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={`Revisión de ${formatMonthLabel(month).toLowerCase()}`}
      description={
        review.status === "cerrada" && review.closedAt
          ? `Cerrada el ${formatDateTime(review.closedAt)} · vencimiento ${formatDate(status.dueDate)}`
          : `En curso${status.dueDate ? ` · vence ${formatDate(status.dueDate)}` : ' · sin fecha mensual asignada'}`
      }
      actions={<PortfolioStatusBadge status={status.status} overdue={status.isOverdue} />}
    >
      <div className="mb-5 rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Tu criterio, paso a paso</p>
        <p className="mt-1 text-muted-foreground">1. Escribí tu lectura interna. 2. Elegí mantener, proponer cambios o pedir información. 3. Guardá la decisión y prepará el borrador al asesor.</p>
        <p className="mt-2 text-xs text-muted-foreground">Cerrar la revisión registra tu trabajo del mes. La validación del asesor y la ejecución se siguen por separado.</p>
      </div>
      <AnalysisNotes key={review.id} review={review} onDirtyChange={setAnalysisDirty}/>
      <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">Contexto: visión general de mercado utilizada</summary><div className="mt-3"><SnapshotBox snapshot={review.marketViewSnapshot} latestVersion={latest?.version} /></div></details>
      {review.status !== 'cerrada' && position && position.id !== review.positionId && <div className="mt-4 rounded border p-3 text-sm">
        <p>Hay una posición al {formatDate(position.cutoffDate)} disponible. Confirmá si querés usarla en esta revisión y en su borrador.</p>
        <Button className="mt-2" variant="outline" disabled={attachPosition.isPending} onClick={() => attachPosition.mutate(position.id)}>{attachPosition.isPending ? 'Vinculando…' : 'Usar esta posición en la revisión'}</Button>
      </div>}
      <div className="mt-5">
        {review.status === "cerrada" && review.decision ? (
          <DecisionSummary decision={review.decision} />
        ) : (
          <DecisionForm key={review.id} review={review} analysisDirty={analysisDirty} />
        )}
      </div>
    </SectionCard>
  );
}

function AnalysisNotes({ review, onDirtyChange }: { review: Review; onDirtyChange: (dirty: boolean) => void }) {
  const queryClient = useQueryClient();
  const [analysis, setAnalysis] = useState(review.analysis || '');
  const save = useRepoMutation((repo, value: string) => repo.saveReviewAnalysis(review.id, value), {
    success: 'Análisis interno guardado', invalidate: [], onSuccess: saved => { cacheSavedReview(queryClient, saved); onDirtyChange(false); },
  });
  const dirty = analysis.trim() !== (review.analysis || '').trim();
  if (review.status === 'cerrada') return review.analysis ? <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Mi análisis de esta cuenta · interno</h3><p className="mt-2 whitespace-pre-wrap text-sm">{review.analysis}</p></div> : null;
  return <div className="space-y-3 rounded-xl border p-4">
    <Field label="1. Mi análisis de esta cuenta" htmlFor={'analysis-'+review.id} hint="Notas internas de trabajo. No se incluyen automáticamente en el correo al asesor. Podés guardarlas sin haber definido una recomendación.">
      <Textarea id={'analysis-'+review.id} rows={5} maxLength={8000} disabled={save.isPending} value={analysis} onChange={e => { setAnalysis(e.target.value); onDirtyChange(e.target.value.trim() !== (review.analysis || '').trim()); }} placeholder="¿Qué veo en la cartera? ¿Qué cambió? ¿Qué me preocupa? Separá hechos, tu interpretación y datos a confirmar."/>
    </Field>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={save.isPending || !dirty} onClick={() => save.mutate(analysis)}>{save.isPending ? 'Guardando análisis…' : 'Guardar mi análisis'}</Button><span role="status" className="text-xs text-muted-foreground">{dirty ? 'Tenés análisis sin guardar.' : review.analysis ? 'Análisis guardado.' : 'Todavía no escribiste tu análisis.'}</span></div>
    {dirty && <p className="text-xs text-muted-foreground">Guardá este análisis antes de cerrar la revisión o salir de la ficha.</p>}
    {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
  </div>;
}

function SnapshotBox({ snapshot, latestVersion }: { snapshot: MarketViewSnapshot|null; latestVersion?: number | undefined }) {
  if(!snapshot)return <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Visión de mercado opcional. Podés revisar esta cartera sin asociar una lectura de mercado.</p>;
  return (
    <div className="rounded-md border border-turquoise/40 bg-accent/50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Lock className="h-3.5 w-3.5 text-accent-foreground" />
        <span className="font-semibold text-accent-foreground">Visión de mercado congelada</span>
        <Badge variant="outline" className="font-mono">v{snapshot.version}</Badge>
        <span className="text-muted-foreground">capturada {formatDateTime(snapshot.capturedAt)}</span>
      </div>
      <div className="mt-2 text-sm font-medium">{snapshot.title}</div>
      <p className="text-sm text-muted-foreground">{snapshot.summary}</p>
      {latestVersion !== undefined && latestVersion > snapshot.version && (
        <p className="mt-2 text-xs text-muted-foreground">
          Existe una versión más nueva (v{latestVersion}). Esta revisión conserva la v{snapshot.version}.
        </p>
      )}
    </div>
  );
}

export function DecisionSummary({ decision }: { decision: Decision }) {
  const rows: [string, string][] = [];
  if (decision.type === "mantener") rows.push(["Nota", decision.nota]);
  if (decision.type === "proponer_cambio") {
    rows.push(
      ["Propuesta", decision.propuesta],
      ["Fundamento de horizonte", decision.fundamentoHorizonte],
      ["Fundamento de liquidez", decision.fundamentoLiquidez],
      ["Validación del asesor", ADVISOR_VALIDATION_LABELS[decision.validacionAsesor]],
      ["Qué debe validar", decision.queValidar ?? "Sin detalle registrado"],
      ["Dato para reconsiderar", decision.datoReconsiderar],
    );
  }
  if (decision.type === "falta_informacion") {
    rows.push(["Información faltante", decision.informacionFaltante], ["Fecha límite", formatDate(decision.fechaLimite)]);
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Decisión</span>
        <Badge variant="accent">{DECISION_LABELS[decision.type]}</Badge>
      </div>
      <dl className="grid gap-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface FormState {
  type: DecisionType | "";
  nota: string;
  propuesta: string;
  queValidar: string;
  fundamentoHorizonte: string;
  fundamentoLiquidez: string;
  validacionAsesor: AdvisorValidation;
  datoReconsiderar: string;
  informacionFaltante: string;
  fechaLimite: string;
}

function initialState(d: Decision | null): FormState {
  return {
    type: d?.type ?? "",
    nota: d?.type === "mantener" ? d.nota : "",
    propuesta: d?.type === "proponer_cambio" ? d.propuesta : "",
    queValidar: d?.type === "proponer_cambio" ? d.queValidar ?? "" : "",
    fundamentoHorizonte: d?.type === "proponer_cambio" ? d.fundamentoHorizonte : "",
    fundamentoLiquidez: d?.type === "proponer_cambio" ? d.fundamentoLiquidez : "",
    validacionAsesor: d?.type === "proponer_cambio" ? d.validacionAsesor : "pendiente",
    datoReconsiderar: d?.type === "proponer_cambio" ? d.datoReconsiderar : "",
    informacionFaltante: d?.type === "falta_informacion" ? d.informacionFaltante : "",
    fechaLimite: d?.type === "falta_informacion" ? d.fechaLimite : addDays(todayInBuenosAires(), 7),
  };
}

function toDecision(s: FormState): unknown {
  switch (s.type) {
    case "mantener":
      return { type: s.type, nota: s.nota };
    case "proponer_cambio":
      return {
        type: s.type,
        propuesta: s.propuesta,
        queValidar: s.queValidar,
        fundamentoHorizonte: s.fundamentoHorizonte,
        fundamentoLiquidez: s.fundamentoLiquidez,
        validacionAsesor: s.validacionAsesor,
        datoReconsiderar: s.datoReconsiderar,
      };
    case "falta_informacion":
      return { type: s.type, informacionFaltante: s.informacionFaltante, fechaLimite: s.fechaLimite };
    default:
      return null;
  }
}

function DecisionForm({ review, analysisDirty }: { review: Review; analysisDirty: boolean }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FormState>(() => initialState(review.decision));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));

  const save = useRepoMutation((repo, d: Decision) => repo.saveDecision(review.id, d), { success: "Decisión guardada", invalidate: [], onSuccess: saved => cacheSavedReview(queryClient, saved) });
  const close = useRepoMutation(
    async (repo, d: Decision) => {
      await repo.saveDecision(review.id, d);
      return repo.closeReview(review.id);
    },
    { success: "Revisión cerrada: la cartera cuenta como revisada", invalidate: ['pendings'], onSuccess: saved => cacheSavedReview(queryClient, saved) },
  );

  const cancel = useRepoMutation((repo, _: void) => repo.cancelEmptyReview(review.id), {
    success: 'Revisión vacía cerrada. Podés iniciarla nuevamente cuando quieras.', invalidate: [],
    onSuccess: cancelled => removeCancelledReview(queryClient, cancelled),
  });
  const cancelEmpty = () => {
    if (state.type && !window.confirm('¿Cerrar sin guardar lo que escribiste? La cartera no se marcará como revisada.')) return;
    cancel.mutate();
  };

  const validate = (): Decision | null => {
    if (!state.type) {
      setErrors({ type: "Elegí una decisión" });
      return null;
    }
    if (state.type === "proponer_cambio" && state.queValidar.trim().length < 5) { setErrors({ queValidar: "Indicá qué debe validar el asesor" }); return null; }
    const parsed = decisionSchema.safeParse(toDecision(state));
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      return null;
    }
    setErrors({});
    return parsed.data;
  };

  const busy = save.isPending || close.isPending || cancel.isPending;

  return (
    <div className="grid gap-5">
      <Field label="2. Qué recomiendo hacer" error={errors["type"]}>
        <RadioGroup
          value={state.type}
          onValueChange={(v) => set("type")(v as DecisionType)}
          className="grid gap-2 sm:grid-cols-3"
        >
          {DECISION_TYPES.map((t) => (
            <label
              key={t}
              htmlFor={`dec-${t}`}
              className="decision-choice flex cursor-pointer items-center gap-3 border bg-card px-4 py-3 text-sm font-medium transition-colors has-[[data-state=checked]]:border-turquoise has-[[data-state=checked]]:bg-accent"
            >
              <RadioGroupItem id={`dec-${t}`} value={t} />
              <span className="decision-copy">{DECISION_LABELS[t]}<small>{t === 'mantener' ? 'Conservar la estrategia.' : t === 'proponer_cambio' ? 'Documentar el cambio.' : 'Pedir el dato que falta.'}</small></span>
            </label>
          ))}
        </RadioGroup>
      </Field>

      {state.type === "mantener" && (
        <Field label="Por qué mantendría esta cartera" htmlFor="nota" error={errors["nota"]} hint={`${state.nota.length}/280`}>
          <Textarea id="nota" placeholder="Qué sigue funcionando y por qué tiene sentido conservar la estrategia." rows={2} maxLength={280} value={state.nota} onChange={(e) => set("nota")(e.target.value)} />
        </Field>
      )}

      {state.type === "proponer_cambio" && (
        <>
          <Field label="Qué cambiaría y por qué" htmlFor="prop" error={errors["propuesta"]} hint="Esta recomendación sí se usa en el borrador al asesor. Detallá qué vender, mantener o sumar; importes o porcentajes y el fundamento.">
            <Textarea id="prop" placeholder="Ejemplo de estructura: reducir [activo / monto], sumar [activo / monto] y mantener [saldo]. Lo propongo porque [tesis y evidencia]." rows={5} value={state.propuesta} onChange={(e) => set("propuesta")(e.target.value)} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Para qué plazo tiene sentido" htmlFor="fh" error={errors["fundamentoHorizonte"]}>
              <Textarea id="fh" placeholder="Horizonte del cliente y plazo necesario para la estrategia." rows={2} value={state.fundamentoHorizonte} onChange={(e) => set("fundamentoHorizonte")(e.target.value)} />
            </Field>
            <Field label="Qué liquidez necesitamos conservar" htmlFor="fl" error={errors["fundamentoLiquidez"]}>
              <Textarea id="fl" placeholder="Retiros esperados, saldo disponible y plazos de rescate." rows={2} value={state.fundamentoLiquidez} onChange={(e) => set("fundamentoLiquidez")(e.target.value)} />
            </Field>
          </div>
          <Field label="3. Qué necesito que valide el asesor" htmlFor="que-validar" error={errors["queValidar"]}><Textarea id="que-validar" placeholder="Confirmar necesidades del cliente, restricciones y aceptación de la propuesta." value={state.queValidar} onChange={e => set("queValidar")(e.target.value)} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Validación del asesor" error={errors["validacionAsesor"]}>
              <Select value={state.validacionAsesor} onValueChange={(v) => set("validacionAsesor")(v as AdvisorValidation)}>
                <SelectTrigger aria-label="Validación del asesor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVISOR_VALIDATIONS.map((v) => <SelectItem key={v} value={v}>{ADVISOR_VALIDATION_LABELS[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Dato que haría reconsiderar" htmlFor="dr" error={errors["datoReconsiderar"]}>
              <Input id="dr" placeholder="Qué dato o escenario invalidaría la propuesta." value={state.datoReconsiderar} onChange={(e) => set("datoReconsiderar")(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      {state.type === "falta_informacion" && (
        <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
          <Field label="Información faltante" htmlFor="if" error={errors["informacionFaltante"]}>
            <Textarea id="if" rows={2} value={state.informacionFaltante} onChange={(e) => set("informacionFaltante")(e.target.value)} />
          </Field>
          <Field label="Fecha límite" htmlFor="fl2" error={errors["fechaLimite"]} hint="Al cerrar se crea un pendiente con este vencimiento">
            <Input id="fl2" type="date" value={state.fechaLimite} onChange={(e) => set("fechaLimite")(e.target.value)} className="font-mono" />
          </Field>
        </div>
      )}

      <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Guardar decisión conserva la recomendación y deja la revisión abierta. Cerrar revisión también la guarda y cuenta la cartera como revisada; no significa que el asesor la haya aprobado ni que se haya ejecutado. Después, abrí Borrador al asesor para actualizar y revisar el mensaje.</p>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" disabled={busy} onClick={() => { const d = validate(); if (d) save.mutate(d); }}>
          {save.isPending ? 'Guardando…' : 'Guardar decisión'}
        </Button>
        <Button disabled={busy || analysisDirty} onClick={() => { if (!state.type && !review.decision && !review.analysis?.trim()) { cancelEmpty(); return; } const d = validate(); if (d) close.mutate(d); }}>
          {cancel.isPending ? 'Cerrando prueba…' : close.isPending ? 'Cerrando…' : 'Cerrar revisión'}
        </Button>
        {!review.decision && !review.analysis?.trim() && state.type && <Button variant="ghost" disabled={busy || analysisDirty} onClick={cancelEmpty}>Cerrar sin guardar</Button>}
      </div>
      {analysisDirty && <p className="text-xs text-muted-foreground">Guardá tu análisis interno antes de cerrar esta revisión.</p>}
      {!review.decision && !review.analysis?.trim() && !state.type && <p className="text-xs text-muted-foreground">Si la abriste para probar, Cerrar revisión la deja sin iniciar y no suma a la cobertura mensual.</p>}
      {(save.error || close.error) && <p role="alert" className="text-sm text-destructive">{(save.error || close.error)?.message}</p>}
      {cancel.error && <p role="alert" className="text-sm text-destructive">{cancel.error.message}</p>}
    </div>
  );
}

