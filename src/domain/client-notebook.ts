import { z } from "zod";
const field = z.string().trim().max(1000);
export const clientContextSchema = z.object({
  profile: field,
  objective: field,
  horizon: field,
  liquidity: field,
  benchmark: field,
});
export type ClientContext = z.infer<typeof clientContextSchema>;
export const emptyContext: ClientContext = {
  profile: "",
  objective: "",
  horizon: "",
  liquidity: "",
  benchmark: "",
};
export interface ClientNote {
  id: string;
  body: string;
  source: "propia" | "asesor";
  at: string;
}
export interface ClientNotebook {
  context: ClientContext;
  notes: ClientNote[];
  updatedAt?: string;
}
export const clientNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  source: z.enum(["propia", "asesor"]),
});
