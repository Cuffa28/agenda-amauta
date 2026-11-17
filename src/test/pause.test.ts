import { describe, expect, it } from "vitest";
import { boardStage, entryVersion, type BoardEntry } from "@/domain/board";
import { applyPauses, isPauseActive, nextMonthStart, type ClientPause } from "@/domain/pause";
import { stageNote } from "@/components/BoardProgress";
import { createMemoryRepository } from "@/data/demo/memory-repository";
import { buildDemoDataset } from "@/data/demo/seed";
import type { Review } from "@/domain/schemas";

const clientId = "00123-00";
const pause = (p: Partial<ClientPause> = {}): ClientPause => ({
  id: "p",
  clientId,
  since: "2026-11-20",
  until: "2027-01-15",
  endedOn: null,
  updatedAt: "2026-11-20T12:00:00Z",
  history: [],
  ...p,
});
const entry = (p: Partial<BoardEntry> = {}): BoardEntry => ({
  id: "e",
  clientId,
  month: "2026-11",
  stage: "pausada",
  updatedAt: "2026-11-20T12:00:01Z",
  history: [],
  ...p,
});
const stageIn = (
  month: string,
  today: string,
  pauses: ClientPause[],
  entries: BoardEntry[] = [],
  review?: Review,
) => {
  const e = applyPauses(entries, pauses, month, today).find((x) => x.clientId === clientId);
  return { stage: boardStage(review ?? null, e), entry: e };
};

describe("Pausas con fecha de regreso", () => {
  it("la pausa sobrevive al cambio de mes y muestra hasta cuándo", () => {
    const { stage, entry: e } = stageIn("2026-12", "2026-12-01", [pause()]);
    expect(stage).toBe("pausada");
    expect(e?.pausedUntil).toBe("2027-01-15");
    expect(stageNote(stage, e, null)?.text).toBe("Hasta 15/01/2027");
    // Aún no existe fila del mes: el movimiento se crea sin versión esperada.
    expect(entryVersion(e)).toBeUndefined();
  });

  it("antes de la fecha de regreso sigue pausada; ese día vuelve sola a Pendiente", () => {
    expect(stageIn("2027-01", "2027-01-14", [pause()]).stage).toBe("pausada");
    const back = stageIn("2027-01", "2027-01-15", [pause()]);
    expect(back.stage).toBe("pendiente");
    expect(stageNote(back.stage, back.entry, null)?.text).toBe("Retomada el 15/01/2027");
  });

  it("una fila del mes que quedó en Pausada no retiene la tarjeta después del regreso", () => {
    const old = entry({ month: "2027-01", updatedAt: "2026-12-01T00:00:00Z" });
    const r = stageIn("2027-01", "2027-01-20", [pause()], [old]);
    expect(r.stage).toBe("pendiente");
    expect(entryVersion(r.entry)).toBe(old.updatedAt);
  });

  it("no toca meses anteriores a la pausa ni posteriores al regreso", () => {
    expect(stageIn("2026-10", "2026-12-01", [pause()]).entry).toBeUndefined();
    expect(stageIn("2027-02", "2026-12-01", [pause()]).entry).toBeUndefined();
  });

  it("sin fecha queda pausada todos los meses y se marca como alerta", () => {
    const { stage, entry: e } = stageIn("2027-06", "2027-06-01", [pause({ until: null })]);
    expect(stage).toBe("pausada");
    expect(stageNote(stage, e, null)).toEqual({ text: "Sin fecha de regreso", warn: true });
  });

  it("un movimiento manual posterior y una revisión cerrada después de pausar mandan", () => {
    const moved = entry({ stage: "en_revision", updatedAt: "2026-11-25T00:00:00Z" });
    expect(stageIn("2026-11", "2026-11-26", [pause()], [moved]).stage).toBe("en_revision");
    const review = {
      id: "r",
      clientId,
      month: "2026-12",
      status: "cerrada",
      decision: { type: "mantener", nota: "ok" },
      positionId: null,
      marketViewSnapshot: null,
      previousConclusion: null,
      startedAt: "2026-12-02T10:00:00Z",
      closedAt: "2026-12-02T11:00:00Z",
    } as Review;
    expect(stageIn("2026-12", "2026-12-03", [pause()], [], review).stage).toBe("revisada");
  });

  it("retomar a mano termina la pausa ese día", () => {
    const ended = pause({ endedOn: "2026-12-10", updatedAt: "2026-12-10T12:00:00Z" });
    expect(isPauseActive(ended, "2026-12-10")).toBe(false);
    expect(stageIn("2026-12", "2026-12-10", [ended]).stage).toBe("pendiente");
    expect(stageIn("2027-01", "2026-12-10", [ended]).entry).toBeUndefined();
  });

  it("marca Revisada sin conclusión cuando solo se movió la tarjeta", () => {
    expect(stageNote("revisada", entry({ stage: "revisada" }), null)?.text).toBe("Sin conclusión");
  });

  it("el próximo mes por defecto es el día 1", () => {
    expect(nextMonthStart("2026-11-17")).toBe("2026-12-01");
    expect(nextMonthStart("2026-12-31")).toBe("2027-01-01");
  });
});

describe("Repositorio demo: pausar y retomar", () => {
  it("guarda la pausa con historial, rechaza fechas pasadas y retoma una sola vez", async () => {
    const repo = createMemoryRepository(
      buildDemoDataset("2026-11-17"),
      () => new Date("2026-11-17T15:00:00Z"),
    );
    const id = (await repo.listClients())[0]!.id;
    await expect(repo.pauseClient({ clientId: id, until: "2026-11-17" })).rejects.toThrow(
      "posterior",
    );
    const p = await repo.pauseClient({ clientId: id, until: "2027-01-15" });
    expect(p).toMatchObject({ since: "2026-11-17", until: "2027-01-15", endedOn: null });
    const r = await repo.resumeClient(id);
    expect(r?.endedOn).toBe("2026-11-17");
    expect(r?.history.map((h) => h.action)).toEqual(["pausa", "retoma"]);
    expect(await repo.resumeClient(id)).toBeNull();
  });
});
