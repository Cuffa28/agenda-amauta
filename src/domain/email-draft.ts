import { formatDate, formatMonthLabel } from "./dates";
import { ADVISOR_VALIDATION_LABELS, DECISION_LABELS } from "./decision";
import { formatMoney } from "./format";
import { reconcilePosition } from "./reconciliation";
import type { Advisor, Client, Position, Review } from "./schemas";

export interface DraftSource {
  client: Client;
  advisor: Advisor;
  position: Position | null;
  review: Review;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Huella de los datos de la ficha que alimentan el borrador. */
export function draftFingerprint({ client, advisor, position, review }: DraftSource): string {
  return fnv1a(
    stableStringify({
      client: { id: client.id, name: client.name, segment: client.segment, sector: client.sector },
      advisor: { name: advisor.name, email: advisor.email },
      position: position
        ? {
            id: position.id,
            alyc: position.alyc,
            cutoffDate: position.cutoffDate,
            items: position.items,
            declaredTotals: position.declaredTotals,
            drivePdf: position.drivePdf,
          }
        : null,
      month: review.month,
      decision: review.decision,
      marketViewVersionId: review.marketViewSnapshot?.versionId || null,
    }),
  );
}

/** La regeneración nunca es automática: solo se avisa cuando la ficha cambió. */
export function needsRegeneration(
  draft: { sourceFingerprint: string } | null,
  currentFingerprint: string,
): boolean {
  return draft !== null && draft.sourceFingerprint !== currentFingerprint;
}

export function generateEmailDraft({ client, advisor, position, review }: DraftSource) {
  const monthLabel = formatMonthLabel(review.month);
  const firstName = advisor.name.split(" ")[0];
  const subject = `Revisión de cartera · ${client.name} (${client.id}) · ${monthLabel}`.slice(0, 200);
  const lines: string[] = [];

  lines.push(`Hola ${firstName},`, "");
  lines.push(
    `Te comparto la revisión mensual de ${monthLabel} de la cartera ${client.id} (${client.name}, segmento ${client.segment}).`,
    "",
  );

  if (position) {
    lines.push(`Posición al ${formatDate(position.cutoffDate)} en ${position.alyc}:`);
    const rec = reconcilePosition(position);
    for (const r of rec) lines.push(`• ${r.currency}: ${formatMoney(r.computed, r.currency)}`);
    const diffs = rec.filter((r) => !r.reconciled);
    if (diffs.length === 0) {
      lines.push("Los totales coinciden con el resumen de la ALyC.");
    } else {
      for (const d of diffs) {
        lines.push(
          d.difference === null
            ? `Atención: el resumen no declara total en ${d.currency}.`
            : `Atención: diferencia de conciliación en ${d.currency} de ${formatMoney(d.difference, d.currency)} contra el resumen.`,
        );
      }
    }
    if (position.drivePdf) lines.push(`PDF original: https://drive.google.com/file/d/${position.drivePdf.fileId}/view`);
    lines.push("");
  } else {
    lines.push("No hay posición cargada para este período.", "");
  }

  const d = review.decision;
  if (!d) {
    lines.push("Decisión: pendiente de registrar.");
  } else {
    lines.push(`Decisión: ${DECISION_LABELS[d.type]}.`);
    if (d.type === "mantener") {
      lines.push(d.nota);
    } else if (d.type === "proponer_cambio") {
      lines.push(
        `Propuesta: ${d.propuesta}`,
        `Qué te pido validar: ${d.queValidar || "Confirmar horizonte, liquidez y restricciones del cliente"}`,
        `Fundamento de horizonte: ${d.fundamentoHorizonte}`,
        `Fundamento de liquidez: ${d.fundamentoLiquidez}`,
        `Dato que nos haría reconsiderar: ${d.datoReconsiderar}`,
        `Estado de validación: ${ADVISOR_VALIDATION_LABELS[d.validacionAsesor]}.`,
      );
    } else {
      lines.push(
        `Para cerrar la revisión necesitamos: ${d.informacionFaltante}`,
        `Fecha límite: ${formatDate(d.fechaLimite)}.`,
      );
    }
  }
  lines.push("");

  const v = review.marketViewSnapshot;
  if (v) lines.push(`Visión de mercado aplicada (v${v.version} · ${v.title}): ${v.summary}`, "");

  if (d?.type === "proponer_cambio" && d.validacionAsesor !== "validada") {
    lines.push("¿Podés validar la propuesta antes de avanzar con el cliente?", "");
  }
  lines.push("Saludos,", "Equipo de inversiones Amauta");

  return { subject, body: lines.join("\n") };
}


/** Exportación explícita para que el usuario decida qué compartir en el chat. */
export function draftForChat(source: DraftSource, draft: { subject: string; body: string }): string {
  return `Cartera: ${source.client.id} · ${source.client.name}\nRevisión: ${source.review.id}\nPara: ${source.advisor.email}\nAsunto: ${draft.subject}\n\n${draft.body}`;
}
