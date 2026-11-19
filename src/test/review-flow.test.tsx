import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailDraftPanel } from "@/components/ficha/EmailDraftPanel";
import type { Review } from "@/domain/schemas";
import type { DraftSource } from "@/domain/email-draft";

const mock = vi.hoisted(() => ({ start: vi.fn(), list: vi.fn(), cancel: vi.fn() }));
vi.mock("@/data/index", () => ({
  getRepository: () => ({
    startReview: mock.start,
    listReviews: mock.list,
    cancelEmptyReview: mock.cancel,
  }),
}));
vi.mock("@/integrations/google/GoogleConnection", () => ({
  GoogleConnection: () => null,
  useGoogleWorkspace: () => ({ connected: false, email: "" }),
}));
const review: Review = {
  id: "review-1",
  clientId: "00123-00",
  month: "2026-11",
  status: "en_curso",
  positionId: null,
  decision: null,
  previousConclusion: null,
  marketViewSnapshot: null,
  startedAt: "2026-11-13T12:00:00Z",
  closedAt: null,
};
const source: DraftSource = {
  client: {
    id: review.clientId,
    name: "Cartera de prueba",
    segment: "Alto",
    advisorId: "advisor",
    reviewDay: 0,
    isDemo: true,
  },
  advisor: { id: "advisor", name: "Asesor de prueba", email: "asesor@example.com" },
  position: null,
  review,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Borrador rápido", () => {
  it("prepara destinatario y asunto al abrir y copia exactamente el texto editado", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EmailDraftPanel source={source} saved={undefined} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Destinatario del borrador" })).toHaveValue(
      "asesor@example.com",
    );
    expect((screen.getByRole("textbox", { name: "Asunto" }) as HTMLInputElement).value).toContain(
      "Cartera de prueba",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Cuerpo editable" }), {
      target: { value: "Este es el texto editado que quiero revisar antes de enviar." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copiar para este chat" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Para: asesor@example.com")),
    );
    expect(writeText.mock.calls[0]?.[0]).toContain("Este es el texto editado");
  });
});
