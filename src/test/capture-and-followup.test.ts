import { describe, expect, it } from "vitest";
import { missedPreviousMonth } from "@/domain/coverage";
import { applyPauses, type ClientPause } from "@/domain/pause";
import { recommendationStatus, waitingRecommendations } from "@/domain/recommendation";
import { stageNote } from "@/components/BoardProgress";
import { createMemoryRepository } from "@/data/demo/memory-repository";
import { buildDemoDataset } from "@/data/demo/seed";
import type { BoardEntry } from "@/domain/board";
import type { Review } from "@/domain/schemas";

const client = { id: "00123-00", reviewDay: 10 };
const review = (p: Partial<Review> = {}): Review =>
  ({
    id: "r1",
    clientId: client.id,
    month: "2026-10",
    status: "cerrada",
    decision: {
      type: "proponer_cambio",
      propuesta: "Bajar duration",
      fundamentoHorizonte: "",
      fundamentoLiquidez: "",
      datoReconsiderar: "",
      validacionAsesor: "pendiente",
    },
    positionId: null,
    marketViewSnapshot: null,
    previousConclusion: null,
    startedAt: "2026-10-10T12:00:00Z",
    closedAt: "2026-10-10T13:00:00Z",
    ...p,
  }) as Review;

describe("Marca de cambio de mes", () => {
  it("marca la cartera con revisión prevista que quedó sin revisar el mes anterior", () => {
    expect(missedPreviousMonth(client, "2026-11", [], [], "2026-11-17")).toBe("2026-10");
    expect(stageNote("pendiente", undefined, null, "2026-10")).toEqual({
      text: "Sin revisar en octubre",
      warn: true,
    });
  });

  it("no marca si no tenía revisión prevista, si se revisó o si el mes no terminó", () => {
    expect(
      missedPreviousMonth({ ...client, reviewDay: 0 }, "2026-11", [], [], "2026-11-17"),
    ).toBeNull();
    const done = review({ decision: { type: "mantener", nota: "ok" } });
    expect(missedPreviousMonth(client, "2026-11", [done], [], "2026-11-17")).toBeNull();
    expect(missedPreviousMonth(client, "2026-12", [], [], "2026-11-17")).toBeNull();
  });

  it("una cartera pausada el mes anterior no queda como incumplida", () => {
    const pause: ClientPause = {
      id: "p",
      clientId: client.id,
      since: "2026-10-01",
      until: "2027-01-15",
      endedOn: null,
      updatedAt: "2026-10-01T12:00:00Z",
      history: [],
    };
    const prev: BoardEntry[] = applyPauses([], [pause], "2026-10", "2026-11-17");
    expect(missedPreviousMonth(client, "2026-11", [], [], "2026-11-17", prev)).toBeNull();
    // Si sigue pausada, la tarjeta muestra "Hasta…" y no la marca de incumplida.
    const now = applyPauses([], [pause], "2026-11", "2026-11-17")[0];
    expect(stageNote("pausada", now, null, "2026-10")?.text).toBe("Hasta 15/01/2027");
  });

  it("una pausa nueva no cambia lo que correspondía a meses anteriores", () => {
    // Pausada en septiembre hasta el 1/11; el 17/11 se vuelve a pausar hasta enero.
    const pause: ClientPause = {
      id: "p",
      clientId: client.id,
      since: "2026-11-17",
      until: "2027-01-01",
      endedOn: null,
      updatedAt: "2026-11-17T15:00:00Z",
      history: [
        { action: "pausa", on: "2026-09-10", until: "2026-11-01", at: "2026-09-10T15:00:00Z" },
        { action: "pausa", on: "2026-11-17", until: "2027-01-01", at: "2026-11-17T15:00:00Z" },
      ],
    };
    const oct = applyPauses([], [pause], "2026-10", "2026-11-17");
    expect(oct[0]).toMatchObject({ stage: "pausada", pausedUntil: "2026-11-01" });
    expect(missedPreviousMonth(client, "2026-11", [], [], "2026-11-17", oct)).toBeNull();
    // Noviembre: retomada el 1/11 y vuelta a pausar el 17 → figura pausada hasta enero.
    const nov = applyPauses([], [pause], "2026-11", "2026-11-17")[0];
    expect(nov).toMatchObject({ stage: "pausada", pausedUntil: "2027-01-01" });
    // Diciembre no recibe la marca de noviembre: noviembre también quedó pausada.
    expect(missedPreviousMonth(client, "2026-12", [], [], "2026-12-05", [nov!])).toBeNull();
  });

  it("retomar a mano cierra el período en ese día y una pausa posterior abre otro", () => {
    const pause: ClientPause = {
      id: "p",
      clientId: client.id,
      since: "2026-12-10",
      until: null,
      endedOn: null,
      updatedAt: "2026-12-10T15:00:00Z",
      history: [
        { action: "pausa", on: "2026-09-10", until: null, at: "2026-09-10T15:00:00Z" },
        { action: "retoma", on: "2026-10-20", at: "2026-10-20T15:00:00Z" },
        { action: "pausa", on: "2026-12-10", until: null, at: "2026-12-10T15:00:00Z" },
      ],
    };
    expect(applyPauses([], [pause], "2026-10", "2026-12-15")[0]?.resumedOn).toBe("2026-10-20");
    // Noviembre quedó libre: corresponde revisarla.
    expect(applyPauses([], [pause], "2026-11", "2026-12-15")).toEqual([]);
    expect(applyPauses([], [pause], "2026-12", "2026-12-15")[0]?.stage).toBe("pausada");
  });
});

describe("Seguimiento de recomendaciones", () => {
  it("una recomendación cerrada arranca esperando al asesor y aparece a los 5 días", () => {
    const s = recommendationStatus(review(), []);
    expect(s).toMatchObject({ state: "esperando", since: "2026-10-10" });
    expect(waitingRecommendations([review()], [])[0]?.dueDate).toBe("2026-10-15");
  });

  it("validada o descartada sale de Mi semana; mantener no tiene seguimiento", () => {
    const rec = {
      id: "x",
      reviewId: "r1",
      clientId: client.id,
      state: "validada" as const,
      on: "2026-10-12",
      note: "OK del asesor",
      updatedAt: "2026-10-12T12:00:00Z",
      history: [],
    };
    expect(recommendationStatus(review(), [rec])?.state).toBe("validada");
    expect(waitingRecommendations([review()], [rec])).toEqual([]);
    expect(
      recommendationStatus(review({ decision: { type: "mantener", nota: "ok" } }), []),
    ).toBeNull();
  });
});

describe("Repositorio demo: tareas y seguimiento", () => {
  const repo = () =>
    createMemoryRepository(buildDemoDataset("2026-11-17"), () => new Date("2026-11-17T15:00:00Z"));

  it("crea tareas sin fecha ni cliente, las reprograma y las recupera después de quitarlas", async () => {
    const r = repo();
    await expect(r.createTask({ title: "  ", dueDate: null, clientId: null })).rejects.toThrow(
      "título",
    );
    const t = await r.createTask({ title: "Leer informe PPI", dueDate: null, clientId: null });
    expect(t).toMatchObject({ status: "abierta", dueDate: null, clientId: null });
    const moved = await r.rescheduleTask(t.id, "2026-11-20", t.updatedAt);
    expect(moved.dueDate).toBe("2026-11-20");
    const removed = await r.setTaskStatus(t.id, "quitada", moved.updatedAt);
    expect(removed.status).toBe("quitada");
    const back = await r.setTaskStatus(t.id, "abierta", removed.updatedAt);
    expect(back).toMatchObject({ status: "abierta", closedAt: null });
    expect(await r.listTasks()).toHaveLength(1);
    expect((await r.listPendings()).some((p) => p.id === t.id)).toBe(false);
  });

  it("solo sigue recomendaciones de cambio cerradas y conserva el historial", async () => {
    const r = repo();
    const reviews = await r.listReviews();
    const change = reviews.find(
      (x) => x.status === "cerrada" && x.decision?.type === "proponer_cambio",
    );
    const keep = reviews.find((x) => x.status === "cerrada" && x.decision?.type === "mantener");
    if (keep)
      await expect(
        r.saveRecommendationState({ reviewId: keep.id, state: "validada" }),
      ).rejects.toThrow();
    if (!change) return;
    await r.saveRecommendationState({
      reviewId: change.id,
      state: "validada",
      note: "Lo charlamos",
    });
    const rec = await r.saveRecommendationState({ reviewId: change.id, state: "esperando" });
    expect(rec.history.map((h) => h.state)).toEqual(["validada", "esperando"]);
  });
});
