import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClientTasks, QuickCapture } from "@/components/Tasks";
import type { Task } from "@/domain/task";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/data/index", () => ({ getRepository: () => ({ createTask: mocks.create }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderCapture = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickCapture clients={[{ id: "00123-00", name: "Cliente Uno" }]} />
    </QueryClientProvider>,
  );
const titleBox = () => screen.getByRole("textbox", { name: "Título de la tarea" });

it("no borra lo escrito mientras el guardado anterior seguía pendiente", async () => {
  let finish: (v: unknown) => void = () => {};
  mocks.create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  renderCapture();
  fireEvent.change(titleBox(), { target: { value: "Leer informe PPI" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith({
      title: "Leer informe PPI",
      dueDate: null,
      clientId: null,
    }),
  );
  // Mientras se guarda, empiezo la siguiente.
  fireEvent.change(titleBox(), { target: { value: "Llamar al asesor" } });
  finish({ id: "t1" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Agregar" })).toBeEnabled());
  expect(titleBox()).toHaveValue("Llamar al asesor");
});

it("si no escribí nada nuevo, limpia el formulario al guardar", async () => {
  mocks.create.mockResolvedValue({ id: "t1" });
  renderCapture();
  fireEvent.change(titleBox(), { target: { value: "Leer informe PPI" } });
  fireEvent.change(screen.getByLabelText("Cliente (opcional)"), { target: { value: "00123-00" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  await waitFor(() => expect(titleBox()).toHaveValue(""));
  expect(screen.getByLabelText("Cliente (opcional)")).toHaveValue("");
});

it("la ficha muestra solo las tareas de esa cuenta, sin duplicarlas", () => {
  const base = {
    createdAt: "2026-11-17T12:00:00Z",
    updatedAt: "2026-11-17T12:00:00Z",
    closedAt: null,
  };
  const tasks = [
    {
      ...base,
      id: "a",
      title: "Pedir extracto",
      dueDate: "2026-11-20",
      clientId: "00123-00",
      status: "abierta",
    },
    {
      ...base,
      id: "b",
      title: "Otra cuenta",
      dueDate: null,
      clientId: "00999-00",
      status: "abierta",
    },
    { ...base, id: "c", title: "Sin cliente", dueDate: null, clientId: null, status: "abierta" },
    {
      ...base,
      id: "d",
      title: "Ya hecha",
      dueDate: null,
      clientId: "00123-00",
      status: "hecha",
      closedAt: "2026-11-17T13:00:00Z",
    },
  ] as Task[];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientTasks clientId="00123-00" tasks={tasks} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Tareas de esta cuenta · 1")).toBeInTheDocument();
  expect(screen.getAllByText("Pedir extracto")).toHaveLength(1);
  expect(screen.queryByText("Otra cuenta")).toBeNull();
  expect(screen.queryByText("Sin cliente")).toBeNull();
  expect(screen.getByText("Hechas y quitadas · 1")).toBeInTheDocument();
});
