import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClientAnotar } from "@/components/ficha/ClientNotebook";

const mocks = vi.hoisted(() => ({ notebook: vi.fn(), save: vi.fn(), note: vi.fn() }));
vi.mock("@/data/index", () => ({
  getRepository: () => ({
    getClientNotebook: mocks.notebook,
    saveClientContext: mocks.save,
    addClientNote: mocks.note,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const context = {
  profile: "",
  objective: "",
  horizon: "",
  liquidity: "USD 50.000 en marzo",
  benchmark: "",
};
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientAnotar clientId="c1" />
    </QueryClientProvider>,
  );

it("por defecto guarda una nota propia con fecha", async () => {
  mocks.notebook.mockResolvedValue({ context, notes: [], updatedAt: "v1" });
  mocks.note.mockResolvedValue({ id: "n", body: "Llamó", source: "propia", at: "x" });
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Anotar" }), { target: { value: "Llamó" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar como nota" }));
  await waitFor(() =>
    expect(mocks.note).toHaveBeenCalledWith("c1", { body: "Llamó", source: "propia" }),
  );
  expect(mocks.save).not.toHaveBeenCalled();
});

it("si sigue valiendo, lo suma al campo elegido del Contexto sin pisar lo anterior", async () => {
  mocks.notebook.mockResolvedValue({ context, notes: [], updatedAt: "v1" });
  mocks.save.mockResolvedValue({ context, notes: [], updatedAt: "v2" });
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Anotar" }), {
    target: { value: "y USD 20.000 en junio" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sumar al Contexto" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sumar al Contexto" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      "c1",
      { ...context, liquidity: "USD 50.000 en marzo\ny USD 20.000 en junio" },
      "v1",
    ),
  );
  expect(mocks.note).not.toHaveBeenCalled();
});
