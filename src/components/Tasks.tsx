import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepoMutation } from "@/data/use-repo-mutation";
import type { Client } from "@/domain/schemas";
import type { Task, TaskStatus } from "@/domain/task";

/** Captura rápida: título obligatorio; fecha y cliente opcionales. Sin interpretar texto. */
export function QuickCapture({ clients }: { clients: Pick<Client, "id" | "name">[] }) {
  const [title, setTitle] = useState(""),
    [date, setDate] = useState(""),
    [clientId, setClientId] = useState("");
  const create = useRepoMutation(
    (repo, _: void) =>
      repo.createTask({ title, dueDate: date || null, clientId: clientId || null }),
    {
      success: "Tarea guardada",
      invalidate: ["tasks"],
      onSuccess: () => {
        setTitle("");
        setDate("");
        setClientId("");
      },
    },
  );
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <form
      className="mb-5 flex flex-wrap items-center gap-2"
      aria-label="Captura rápida"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && !create.isPending) create.mutate();
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nueva tarea…"
        aria-label="Título de la tarea"
        maxLength={200}
        className="min-w-[12rem] flex-1"
      />
      <input
        type="date"
        aria-label="Fecha (opcional)"
        className="rounded-lg border bg-background px-2 py-1.5 text-sm"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <select
        aria-label="Cliente (opcional)"
        className="max-w-[12rem] rounded-lg border bg-background px-2 py-1.5 text-sm"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      >
        <option value="">Sin cliente</option>
        {sorted.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!title.trim() || create.isPending}>
        Agregar
      </Button>
    </form>
  );
}

function useTaskActions() {
  const status = useRepoMutation(
    (repo, v: { task: Task; status: TaskStatus }) =>
      repo.setTaskStatus(v.task.id, v.status, v.task.updatedAt),
    { invalidate: ["tasks"] },
  );
  const reschedule = useRepoMutation(
    (repo, v: { task: Task; dueDate: string | null }) =>
      repo.rescheduleTask(v.task.id, v.dueDate, v.task.updatedAt),
    { success: "Fecha actualizada", invalidate: ["tasks"] },
  );
  return { status, reschedule, busy: status.isPending || reschedule.isPending };
}

/** Fila de tarea: hecha, cambiar fecha o quitar. Las cerradas se pueden recuperar. */
export function TaskRow({ task, clientName }: { task: Task; clientName?: string | undefined }) {
  const { status, reschedule, busy } = useTaskActions();
  const open = task.status === "abierta";
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {open && (
        <button
          type="button"
          aria-label={`Marcar hecha: ${task.title}`}
          className="h-4 w-4 shrink-0 rounded border hover:bg-muted"
          disabled={busy}
          onClick={() => status.mutate({ task, status: "hecha" })}
        />
      )}
      <span className={`min-w-0 ${open ? "" : "text-muted-foreground line-through"}`}>
        {task.title}
        {task.clientId && (
          <Link
            to="/clientes/$clientId"
            params={{ clientId: task.clientId }}
            className="ml-2 text-xs text-muted-foreground hover:underline"
          >
            {clientName || task.clientId}
          </Link>
        )}
      </span>
      {open ? (
        <span className="ml-auto flex items-center gap-1">
          <input
            type="date"
            aria-label={`Cambiar fecha: ${task.title}`}
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={task.dueDate ?? ""}
            disabled={busy}
            onChange={(e) => reschedule.mutate({ task, dueDate: e.target.value || null })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => status.mutate({ task, status: "quitada" })}
          >
            Quitar
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          disabled={busy}
          onClick={() => status.mutate({ task, status: "abierta" })}
        >
          Recuperar
        </Button>
      )}
    </div>
  );
}
