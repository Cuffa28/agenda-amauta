import { z } from "zod";

import { isValidMonth } from "@/domain/dates";

/** `?mes=AAAA-MM` libre: cualquier mes válido, sin límites de rango. */
export const monthSearchSchema = z.object({
  mes: z.string().refine(isValidMonth).optional().catch(undefined),
});

