import { z } from "zod";

import { BA_TZ, isRealDate, isValidMonth } from "./dates";

const text = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label}: requerido`, invalid_type_error: `${label}: requerido` })
    .trim()
    .min(min, `${label}: mínimo ${min} caracteres`)
    .max(max, `${label}: máximo ${max} caracteres`);

export const monthSchema = z.string().refine(isValidMonth, "Mes inválido: usá AAAA-MM");
export const isoDateSchema = z.string().refine(isRealDate, "Fecha inválida: usá AAAA-MM-DD");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida: usá HH:MM");
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** ID estable de cartera: texto con ceros iniciales (nunca número). */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const clientIdSchema = z
  .string({ invalid_type_error: "El ID debe ser texto para conservar los ceros iniciales" })
  .regex(CLIENT_ID_PATTERN, "El ID debe conservar el texto original, p. ej. 00123-00");

export const SEGMENTS = ["Medio", "Alto", "Premium"] as const;
export const segmentSchema = z.enum(SEGMENTS);
export type Segment = z.infer<typeof segmentSchema>;

export const CURRENCIES = ["ARS", "USD"] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

export const advisorSchema = z.object({
  id: z.string().min(1),
  name: text("Nombre del asesor", 2, 120),
  email: z.union([z.string().trim().email("Correo del asesor inválido"), z.literal("")]),
});
export type Advisor = z.infer<typeof advisorSchema>;

export const clientSchema = z.object({
  id: clientIdSchema,
  name: text("Nombre", 2, 120),
  segment: segmentSchema,
  sector: z.string().trim().min(1).max(80, "Sector: máximo 80 caracteres").optional(),
  advisorId: z.string().min(1, "Asigná un asesor"),
  reviewDay: z.number().int().min(0).max(31),
  isDemo: z.boolean(),
  updatedAt: isoDateTimeSchema.optional(),
});
export type Client = z.infer<typeof clientSchema>;

export const clientUpdateSchema = clientSchema
  .pick({ name: true, segment: true, sector: true, advisorId: true })
  .extend({ reviewDay: z.number().int().min(0).max(31).optional(), advisorName: z.string().trim().max(120).optional(), advisorEmail: z.union([z.string().email(),z.literal("")]).optional(), expectedUpdatedAt: isoDateTimeSchema.optional() })
  .strict();
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

export const positionItemSchema = z.object({
  id: z.string().min(1),
  instrument: text("Instrumento", 2, 160),
  ticker: z.string().trim().max(20).optional(),
  currency: currencySchema,
  quantity: z.number().finite(),
  price: z.number().finite().nonnegative(),
  marketValue: z.number().finite(),
});
export type PositionItem = z.infer<typeof positionItemSchema>;

export const positionSchema = z
  .object({
    id: z.string().min(1),
    clientId: clientIdSchema,
    alyc: text("ALyC", 2, 120),
    cutoffDate: isoDateSchema,
    drivePdf: z.object({
      fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, "ID de archivo de Drive inválido"),
      fileName: z.string().min(1).max(200),
    }).nullable(),
    sourceNote: z.string().max(2000).optional(),
    items: z.array(positionItemSchema).min(1, "La posición debe tener al menos una partida"),
    declaredTotals: z.array(z.object({ currency: currencySchema, amount: z.number().finite() })),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    for (const t of p.declaredTotals) {
      if (seen.has(t.currency)) {
        ctx.addIssue({ code: "custom", message: `Total declarado duplicado para ${t.currency}` });
      }
      seen.add(t.currency);
    }
  });
export type Position = z.infer<typeof positionSchema>;

export const DECISION_TYPES = ["mantener", "proponer_cambio", "falta_informacion"] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export const ADVISOR_VALIDATIONS = ["pendiente", "validada", "observada"] as const;
export type AdvisorValidation = (typeof ADVISOR_VALIDATIONS)[number];

export const keepDecisionSchema = z.object({
  type: z.literal("mantener"),
  nota: text("Nota", 3, 280),
});
export const changeDecisionSchema = z.object({
  type: z.literal("proponer_cambio"),
  propuesta: text("Propuesta", 10, 2000),
  queValidar: text("Qué debe validar el asesor", 5, 1000).optional(),
  fundamentoHorizonte: text("Fundamento de horizonte", 5, 1000),
  fundamentoLiquidez: text("Fundamento de liquidez", 5, 1000),
  validacionAsesor: z.enum(ADVISOR_VALIDATIONS),
  datoReconsiderar: text("Dato para reconsiderar", 3, 500),
});
export const missingInfoDecisionSchema = z.object({
  type: z.literal("falta_informacion"),
  informacionFaltante: text("Información faltante", 5, 1000),
  fechaLimite: isoDateSchema,
});
export const decisionSchema = z.discriminatedUnion("type", [
  keepDecisionSchema,
  changeDecisionSchema,
  missingInfoDecisionSchema,
]);
export type Decision = z.infer<typeof decisionSchema>;

export const marketViewVersionSchema = z.object({
  id: z.string().min(1),
  marketViewId: z.string().min(1),
  version: z.number().int().positive(),
  title: text("Título", 3, 140),
  summary: text("Resumen", 10, 400),
  body: text("Desarrollo", 20, 8000),
  author: text("Autor", 2, 120),
  publishedAt: isoDateTimeSchema,
});
export type MarketViewVersion = z.infer<typeof marketViewVersionSchema>;

export const marketViewVersionInputSchema = marketViewVersionSchema
  .pick({ title: true, summary: true, body: true, author: true })
  .strict();
export type MarketViewVersionInput = z.infer<typeof marketViewVersionInputSchema>;

/** Copia congelada de la visión usada por una revisión. Nunca se actualiza. */
export const marketViewSnapshotSchema = z.object({
  versionId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  publishedAt: isoDateTimeSchema,
  capturedAt: isoDateTimeSchema,
});
export type MarketViewSnapshot = z.infer<typeof marketViewSnapshotSchema>;

export const REVIEW_STATUSES = ["en_curso", "cerrada"] as const;
export const reviewSchema = z.object({
  id: z.string().min(1),
  clientId: clientIdSchema,
  month: monthSchema,
  status: z.enum(REVIEW_STATUSES),
  positionId: z.string().nullable(),
  previousConclusion: z.string().nullable(),
  decision: decisionSchema.nullable(),
  marketViewSnapshot: marketViewSnapshotSchema,
  startedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const PENDING_ORIGINS = ["falta_informacion", "propuesta", "manual"] as const;
export const pendingInputSchema = z
  .object({
    clientId: clientIdSchema,
    reviewId: z.string().min(1, "El pendiente debe estar ligado a una revisión"),
    origin: z.enum(PENDING_ORIGINS),
    description: text("Descripción", 3, 500),
    dueDate: isoDateSchema,
  })
  .strict();
export type PendingInput = z.infer<typeof pendingInputSchema>;
export const pendingSchema = pendingInputSchema.extend({
  id: z.string().min(1),
  status: z.enum(["abierto", "resuelto"]),
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type PendingItem = z.infer<typeof pendingSchema>;

export const emailDraftInputSchema = z
  .object({
    reviewId: z.string().min(1),
    subject: text("Asunto", 3, 200),
    body: text("Cuerpo", 10, 10000),
    sourceFingerprint: z.string().min(1),
    editedManually: z.boolean(),
    generatedAt: isoDateTimeSchema,
  })
  .strict();
export type EmailDraftInput = z.infer<typeof emailDraftInputSchema>;
export const emailDraftSchema = emailDraftInputSchema.extend({ updatedAt: isoDateTimeSchema });
export type EmailDraft = z.infer<typeof emailDraftSchema>;

export const followUpLinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("revision"), reviewId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("propuesta"), reviewId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("pendiente"), pendingId: z.string().min(1) }).strict(),
]);
export type FollowUpLink = z.infer<typeof followUpLinkSchema>;

export const FOLLOW_UP_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
/** Estricto: no admite invitados ni ningún campo extra. */
export const followUpInputSchema = z
  .object({
    clientId: clientIdSchema,
    title: text("Título", 3, 120),
    link: followUpLinkSchema,
    date: isoDateSchema,
    time: timeSchema,
    durationMinutes: z
      .number()
      .int()
      .min(15, "Duración mínima: 15 minutos")
      .max(480, "Duración máxima: 8 horas"),
    notes: z.string().trim().max(1000, "Notas: máximo 1000 caracteres").optional(),
  })
  .strict();
export type FollowUpInput = z.infer<typeof followUpInputSchema>;
export const followUpSchema = followUpInputSchema.extend({
  id: z.string().min(1),
  timezone: z.literal(BA_TZ),
  createdAt: isoDateTimeSchema,
});
export type FollowUp = z.infer<typeof followUpSchema>;

/** Convierte errores de zod en un mapa campo → mensaje para formularios. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

