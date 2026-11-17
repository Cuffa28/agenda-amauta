import { z } from "zod";
import { isRealDate } from "./dates";
import { clientIdSchema } from "./schemas";

/**
 * Pedidos e indicaciones que dejan los asesores sobre un cliente.
 * - Pedido puntual: recibido → en curso → resuelto.
 * - Indicación vigente: sigue vigente hasta que alguien la marque "ya no aplica".
 * Resolver un pedido no toca las indicaciones. Nada se borra.
 * Sin respuestas escritas: si hace falta conversar, se usa el canal habitual.
 */
export const REQUEST_KINDS = ["pedido", "indicacion"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  pedido: "Pedido puntual",
  indicacion: "Indicación vigente",
};

export const REQUEST_STATUSES = [
  "recibido",
  "en_curso",
  "resuelto",
  "vigente",
  "ya_no_aplica",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  recibido: "Recibido",
  en_curso: "En curso",
  resuelto: "Resuelto",
  vigente: "Vigente",
  ya_no_aplica: "Ya no aplica",
};
/** Estados a los que el owner puede mover un pedido puntual. */
export const PEDIDO_STATUSES = ["recibido", "en_curso", "resuelto"] as const;

export interface AdvisorRequest {
  id: string;
  clientId: string;
  kind: RequestKind;
  body: string;
  /** AAAA-MM-DD; solo pedidos puntuales. */
  desiredDate: string | null;
  authorEmail: string;
  status: RequestStatus;
  /** Cuándo lo vio el owner. null = "Nuevo". */
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: { status: RequestStatus; by: string; at: string }[];
}

export const requestInputSchema = z
  .object({
    clientId: clientIdSchema,
    kind: z.enum(REQUEST_KINDS),
    body: z
      .string()
      .trim()
      .min(1, "Escribí el pedido o la indicación")
      .max(1000, "Máximo 1000 caracteres"),
    desiredDate: z.string().refine(isRealDate, "Fecha inválida").nullable(),
  })
  .refine((v) => v.kind === "pedido" || v.desiredDate === null, {
    message: "Una indicación vigente no lleva fecha",
    path: ["desiredDate"],
  });
export type RequestInput = z.infer<typeof requestInputSchema>;

export const isOpenRequest = (r: AdvisorRequest) =>
  r.status === "recibido" || r.status === "en_curso" || r.status === "vigente";
export const isNewRequest = (r: AdvisorRequest) => r.seenAt === null && isOpenRequest(r);

/**
 * Clientes sobre los que un asesor puede dejar pedidos (misma regla que la base):
 * los suyos, los sin asesor y los asignados a un owner (todos los ven).
 */
export function advisorVisibleClients<C extends { id: string; advisorId: string }>(
  clients: C[],
  advisors: { id: string; email: string }[],
  viewerEmail: string,
  ownerEmails: string[],
): C[] {
  const me = viewerEmail.trim().toLowerCase();
  const owners = new Set(ownerEmails.map((e) => e.toLowerCase()));
  const emailOf = new Map(advisors.map((a) => [a.id, a.email.trim().toLowerCase()]));
  return clients.filter((c) => {
    const email = emailOf.get(c.advisorId) ?? "";
    return !email || email === me || owners.has(email);
  });
}
