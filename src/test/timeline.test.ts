import { describe, expect, it } from "vitest";
import { boardStage, type BoardEntry } from "@/domain/board";
import { portfolioMonthStatus } from "@/domain/coverage";
import { stageNote } from "@/components/BoardProgress";
import { buildTimeline, isContextStale } from "@/domain/timeline";
import type { Review } from "@/domain/schemas";

const review = (p: Partial<Review>): Review =>
  ({
    id: "r1",
    clientId: "c1",
    month: "2026-10",
    status: "cerrada",
    decision: { type: "mantener", nota: "" },
    analysis: "Todo en orden",
    positionId: null,
    previousConclusion: null,
    marketViewSnapshot: null,
    startedAt: "2026-10-10T12:00:00Z",
    closedAt: "2026-10-10T13:00:00Z",
    ...p,
  }) as Review;

describe("Historial único del cliente", () => {
  it("junta revisiones, notas, pedidos, tareas y contexto, de lo más nuevo a lo más viejo", () => {
    const t = buildTimeline({
      clientId: "c1",
      reviews: [review({}), review({ id: "otro", clientId: "c2" })],
      notes: [
        {
          id: "n1",
          body: "Cobra un campo en febrero",
          source: "propia",
          at: "2026-11-05T12:00:00Z",
        },
        { id: "n0", body: "Dato viejo", source: "asesor", at: "2026-09-01T12:00:00Z" },
      ],
      requests: [
        {
          id: "q1",
          clientId: "c1",
          kind: "pedido",
          body: "Resumen táctico",
          desiredDate: null,
          authorEmail: "florencia@x.com",
          status: "recibido",
          seenAt: null,
          createdAt: "2026-11-10T12:00:00Z",
          updatedAt: "2026-11-10T12:00:00Z",
          history: [],
        },
      ],
      tasks: [
        {
          id: "t1",
          title: "Pedir extracto",
          dueDate: null,
          clientId: "c1",
          status: "hecha",
          createdAt: "2026-11-01T12:00:00Z",
          updatedAt: "2026-11-02T12:00:00Z",
          closedAt: "2026-11-02T12:00:00Z",
        },
      ],
      recommendations: [],
      contextUpdatedAt: "2026-11-12T12:00:00Z",
    });
    expect(t.map((e) => e.kind)).toEqual([
      "contexto",
      "asesor",
      "nota",
      "tarea",
      "tarea",
      "revision",
      "asesor",
    ]);
    expect(t.find((e) => e.kind === "revision")?.title).toBe(
      "Revisión de octubre de 2026 · Mantener",
    );
    expect(t[1]?.title).toBe("Pedido puntual de Florencia · recibido");
    expect(t.some((e) => e.id.includes("otro"))).toBe(false);
  });
});

describe("Contexto viejo", () => {
  it("avisa cuando pasaron más de 6 meses sin actualizarlo", () => {
    expect(isContextStale("2026-05-10T12:00:00Z", "2026-11-19")).toBe(true);
    expect(isContextStale("2026-06-01T12:00:00Z", "2026-11-19")).toBe(false);
    expect(isContextStale(undefined, "2026-11-19")).toBe(false);
  });
});

describe("Sin columna En revisión", () => {
  it("una tarjeta guardada antes en En revisión se ve como Pendiente", () => {
    const old: BoardEntry = {
      id: "e",
      clientId: "c1",
      month: "2026-11",
      stage: "en_revision",
      updatedAt: "2026-11-02T12:00:00Z",
      history: [],
    };
    expect(boardStage(null, old)).toBe("pendiente");
  });
  it("una lectura guardada sin decidir queda Pendiente, aclarado en la tarjeta, y cuenta en curso", () => {
    const open = review({ month: "2026-11", status: "en_curso", decision: null, closedAt: null });
    expect(boardStage(open)).toBe("pendiente");
    expect(stageNote("pendiente", undefined, open)?.text).toBe("Lectura guardada, sin decidir");
    expect(
      portfolioMonthStatus({ id: "c1", reviewDay: 20 }, "2026-11", [open], [], "2026-11-19").status,
    ).toBe("en_curso");
  });
});
