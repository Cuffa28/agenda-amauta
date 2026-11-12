import { todayInBuenosAires } from "@/domain/dates";
import { createMemoryRepository } from "./demo/memory-repository";
import { buildDemoDataset } from "./demo/seed";
import { createSupabaseRepository } from "./supabase/repository";
import type { AgendaRepository } from "./repository";
let instance: AgendaRepository | null = null;
export function getRepository(): AgendaRepository {
  if (!instance) instance = import.meta.env['VITE_AGENDA_MODE'] === 'demo'
    ? createMemoryRepository(buildDemoDataset(todayInBuenosAires()))
    : createSupabaseRepository();
  return instance;
}
