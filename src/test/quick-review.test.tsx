import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuickReview } from "@/components/ficha/QuickReview";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  save: vi.fn(),
  close: vi.fn(),
  analysis: vi.fn(),
  notebook: vi.fn(),
}));
vi.mock("@/data/index", () => ({
  getRepository: () => ({
    startReview: mocks.start,
    saveDecision: mocks.save,
    closeReview: mocks.close,
    saveReviewAnalysis: mocks.analysis,
    getClientNotebook: mocks.notebook,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const base = { id: "r", clientId: "c", month: "2026-11", analysis: "" };
const mount = (cache = new QueryClient()) =>
  render(
    <QueryClientProvider client={cache}>
      <QuickReview clientId="c" month="2026-11" review={null} previous="Mantener" />
    </QueryClientProvider>,
  );
const reading = () => screen.getByRole("textbox", { name: /Mi lectura/ });

it("registra mantener con una sola acción y muestra la revisión anterior", async () => {
  const r = { ...base, status: "cerrada", decision: { type: "mantener", nota: "" } };
  mocks.notebook.mockResolvedValue({ context: {}, notes: [] });
  mocks.start.mockResolvedValue({ ...r, status: "en_curso" });
  mocks.save.mockResolvedValue(r);
  mocks.close.mockResolvedValue(r);
  const cache = new QueryClient();
  cache.setQueryData(["reviews"], []);
  mount(cache);
  expect(screen.getByText(/La vez anterior/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Guardar revisión" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Mantener" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith("r"));
  expect(mocks.save).toHaveBeenCalledWith("r", { type: "mantener", nota: "" });
  expect(mocks.analysis).not.toHaveBeenCalled();
  await waitFor(() => expect(cache.getQueryData(["reviews"])).toEqual([r]));
});

it("un cambio toma horizonte y liquidez del Contexto, sin volver a escribirlos", async () => {
  mocks.notebook.mockResolvedValue({
    context: { horizon: "3 años", liquidity: "USD 50.000 en marzo" },
    notes: [],
  });
  mocks.start.mockResolvedValue({ ...base, status: "en_curso" });
  mocks.analysis.mockResolvedValue({ ...base, status: "en_curso", analysis: "Mucha liquidez" });
  mocks.save.mockResolvedValue({});
  mocks.close.mockResolvedValue({ ...base, status: "cerrada" });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recomiendo cambio" }));
  expect(await screen.findByText(/horizonte 3 años/)).toBeInTheDocument();
  fireEvent.change(reading(), { target: { value: "Mucha liquidez" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Qué cambiaría/ }), {
    target: { value: "Pasar 20% a Lecaps" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.analysis).toHaveBeenCalledWith("r", "Mucha liquidez");
  expect(mocks.save).toHaveBeenCalledWith(
    "r",
    expect.objectContaining({
      type: "proponer_cambio",
      propuesta: "Pasar 20% a Lecaps",
      fundamentoHorizonte: "3 años",
      fundamentoLiquidez: "USD 50.000 en marzo",
    }),
  );
});

it("si falla el guardado conserva lo escrito y permite reintentar", async () => {
  mocks.notebook.mockResolvedValue({ context: {}, notes: [] });
  mocks.start.mockResolvedValue({ ...base, status: "en_curso" });
  mocks.analysis.mockResolvedValue({ ...base, status: "en_curso" });
  mocks.save.mockResolvedValue({});
  mocks.close.mockRejectedValue(Error("No se pudo guardar"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recomiendo cambio" }));
  fireEvent.change(reading(), { target: { value: "Revisar saldo disponible" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar");
  expect(reading()).toHaveValue("Revisar saldo disponible");
  expect(screen.getByRole("button", { name: "Guardar revisión" })).toBeEnabled();
});

it("sin decidir todavía, guarda la lectura sin cerrar la revisión", async () => {
  mocks.notebook.mockResolvedValue({ context: {}, notes: [] });
  mocks.start.mockResolvedValue({ ...base, status: "en_curso" });
  mocks.analysis.mockResolvedValue({ ...base, status: "en_curso", analysis: "A medio pensar" });
  mount();
  fireEvent.change(reading(), { target: { value: "A medio pensar" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar sin cerrar" }));
  await waitFor(() => expect(mocks.analysis).toHaveBeenCalledWith("r", "A medio pensar"));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.close).not.toHaveBeenCalled();
});

it("falta información pide qué falta antes de guardar", async () => {
  mocks.notebook.mockResolvedValue({ context: {}, notes: [] });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Falta información" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Escribí qué información falta");
  expect(mocks.start).not.toHaveBeenCalled();
});
