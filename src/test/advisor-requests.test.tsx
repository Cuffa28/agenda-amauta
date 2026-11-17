import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advisorVisibleClients, isNewRequest, requestInputSchema } from "@/domain/request";
import { createMemoryRepository, demoViewer } from "@/data/demo/memory-repository";
import { buildDemoDataset } from "@/data/demo/seed";
import { createSupabaseRepository } from "@/data/supabase/repository";

const as = (role: "owner" | "asesor", email: string) => {
  demoViewer.role = role;
  demoViewer.email = email;
};
afterEach(() => as("owner", "owner@example.com"));

describe("Quién ve qué cliente", () => {
  const advisors = [
    { id: "fl", email: "florencia@x.com" },
    { id: "jc", email: "jeronimo@x.com" },
    { id: "fa", email: "facundo@x.com" },
    { id: "unassigned", email: "" },
  ];
  const clients = [
    { id: "1", advisorId: "fl" },
    { id: "2", advisorId: "jc" },
    { id: "3", advisorId: "fa" },
    { id: "4", advisorId: "unassigned" },
  ];
  it("un asesor ve los suyos, los de Facundo (FA) y los sin asignar; nunca los de otro asesor", () => {
    const ids = advisorVisibleClients(clients, advisors, "Florencia@x.com", ["facundo@x.com"]).map(
      (c) => c.id,
    );
    expect(ids).toEqual(["1", "3", "4"]);
  });
  it("al reasignar un cliente FA a otro asesor, deja de verlo el resto", () => {
    const moved = clients.map((c) => (c.id === "3" ? { ...c, advisorId: "jc" } : c));
    expect(
      advisorVisibleClients(moved, advisors, "florencia@x.com", ["facundo@x.com"]).map((c) => c.id),
    ).toEqual(["1", "4"]);
  });
  it("una indicación vigente no lleva fecha", () => {
    const r = requestInputSchema.safeParse({
      clientId: "00062-00",
      kind: "indicacion",
      body: "Prefiere resúmenes tácticos",
      desiredDate: "2026-11-20",
    });
    expect(r.success).toBe(false);
  });
});

describe("Pedidos e indicaciones (demo)", () => {
  const setup = () => {
    const data = buildDemoDataset("2026-11-17");
    const repo = createMemoryRepository(data, () => new Date("2026-11-17T15:00:00Z"));
    const alfa = data.advisors[0]!;
    const own = data.clients.find((c) => c.advisorId === alfa.id)!;
    const other = data.clients.find((c) => c.advisorId !== alfa.id)!;
    return { repo, alfa, own, other };
  };

  it("el asesor deja un pedido: queda Recibido, con su autor, y Nuevo para Facundo", async () => {
    const { repo, alfa, own } = setup();
    as("asesor", alfa.email);
    const r = await repo.createRequest({
      clientId: own.id,
      kind: "pedido",
      body: "Resumen táctico antes del viernes",
      desiredDate: "2026-11-20",
    });
    expect(r).toMatchObject({ status: "recibido", authorEmail: alfa.email, seenAt: null });
    as("owner", "owner@example.com");
    const [seen] = await repo.listRequests();
    expect(isNewRequest(seen!)).toBe(true);
    const doing = await repo.setRequestStatus(seen!.id, "en_curso", seen!.updatedAt);
    expect(isNewRequest(doing)).toBe(false);
    expect(doing.history.map((h) => h.status)).toEqual(["recibido", "en_curso"]);
  });

  it("no puede dejar pedidos sobre clientes de otro asesor ni cambiar estados", async () => {
    const { repo, alfa, own, other } = setup();
    as("asesor", alfa.email);
    expect((await repo.listRequestClients()).some((c) => c.id === other.id)).toBe(false);
    await expect(
      repo.createRequest({ clientId: other.id, kind: "pedido", body: "x", desiredDate: null }),
    ).rejects.toThrow("no está entre los tuyos");
    const r = await repo.createRequest({
      clientId: own.id,
      kind: "pedido",
      body: "Consulta",
      desiredDate: null,
    });
    await expect(repo.setRequestStatus(r.id, "resuelto", r.updatedAt)).rejects.toThrow(
      "Solo Facundo",
    );
  });

  it("cada asesor ve solo lo que escribió", async () => {
    const { repo, alfa, own } = setup();
    as("asesor", alfa.email);
    await repo.createRequest({ clientId: own.id, kind: "pedido", body: "Mío", desiredDate: null });
    as("asesor", "otro@example.com");
    expect(await repo.listRequests()).toEqual([]);
  });

  it("resolver un pedido no toca una indicación vigente; solo se da de baja a mano", async () => {
    const { repo, alfa, own } = setup();
    as("asesor", alfa.email);
    const ind = await repo.createRequest({
      clientId: own.id,
      kind: "indicacion",
      body: "Prefiere resúmenes tácticos",
      desiredDate: null,
    });
    const ped = await repo.createRequest({
      clientId: own.id,
      kind: "pedido",
      body: "Resumen de esta semana",
      desiredDate: null,
    });
    as("owner", "owner@example.com");
    await repo.setRequestStatus(ped.id, "resuelto", ped.updatedAt);
    const after = await repo.listRequests();
    expect(after.find((r) => r.id === ind.id)?.status).toBe("vigente");
    as("asesor", alfa.email);
    expect((await repo.retireIndication(ind.id)).status).toBe("ya_no_aplica");
    await expect(repo.retireIndication(ind.id)).rejects.toThrow("ya no estaba vigente");
  });
});

describe("Base real", () => {
  it("si la tabla de pedidos todavía no existe, la agenda sigue funcionando", async () => {
    const client = {
      from: () => ({
        select: async () => ({
          data: null,
          error: { code: "PGRST205", message: "Could not find the table" },
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await createSupabaseRepository(() => client).listRequests()).toEqual([]);
  });
});

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/data/supabase/client", () => ({
  getSupabase: () => ({ auth: api }),
  requireAgendaSession: () => api.requireSession(),
}));

describe("Acceso por rol", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_AGENDA_MODE", "");
    api.getSession.mockResolvedValue({
      data: { session: { user: { id: "u", email: "florencia@example.com" } } },
      error: null,
    });
    api.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });
  const mount = async () => {
    const { AuthGate, RoleSwitch } = await import("@/components/AuthGate");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthGate>
          <RoleSwitch advisor={<div>Pantalla de pedidos</div>}>
            <div>Agenda privada</div>
          </RoleSwitch>
        </AuthGate>
      </QueryClientProvider>,
    );
  };
  it("un asesor ve solo la pantalla de pedidos, nunca la agenda", async () => {
    api.requireSession.mockResolvedValue({ user: {}, role: "asesor" });
    await mount();
    expect(await screen.findByText("Pantalla de pedidos")).toBeInTheDocument();
    expect(screen.queryByText("Agenda privada")).toBeNull();
  });
  it("el owner ve la agenda", async () => {
    api.requireSession.mockResolvedValue({ user: {}, role: "owner" });
    await mount();
    await waitFor(() => expect(screen.getByText("Agenda privada")).toBeInTheDocument());
    expect(screen.queryByText("Pantalla de pedidos")).toBeNull();
  });
});
