import { formatDate } from "./dates";
import type { AdvisorValidation, Decision, DecisionType } from "./schemas";

export const DECISION_LABELS: Record<DecisionType, string> = {
  mantener: "Mantener",
  proponer_cambio: "Proponer un cambio",
  falta_informacion: "Falta información",
};

export const ADVISOR_VALIDATION_LABELS: Record<AdvisorValidation, string> = {
  pendiente: "Pendiente de validar",
  validada: "Validada por el asesor",
  observada: "Observada por el asesor",
};

/** Texto breve que se usa como "conclusión anterior" en la revisión siguiente. */
export function describeDecision(decision: Decision): string {
  switch (decision.type) {
    case "mantener":
      return `Mantener: ${decision.nota}`;
    case "proponer_cambio":
      return `Proponer un cambio: ${decision.propuesta} (${ADVISOR_VALIDATION_LABELS[decision.validacionAsesor].toLowerCase()})`;
    case "falta_informacion":
      return `Falta información: ${decision.informacionFaltante} (límite ${formatDate(decision.fechaLimite)})`;
  }
}

