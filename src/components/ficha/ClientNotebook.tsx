import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRepository } from "@/data";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { SectionCard } from "@/components/PageHeader";
import { RequestRow } from "@/components/Requests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/domain/dates";
import type { ClientContext, ClientNotebook as Notebook } from "@/domain/client-notebook";
import type { AdvisorRequest } from "@/domain/request";
import type { Client } from "@/domain/schemas";

const LABELS: Record<keyof ClientContext, string> = {
  profile: "Perfil",
  objective: "Objetivo",
  horizon: "Horizonte",
  liquidity: "Liquidez necesaria",
  benchmark: "Benchmark",
};
const HINTS: Record<keyof ClientContext, string> = {
  profile: "Moderado, conservador…",
  objective: "Preservar capital en dólares, renta…",
  horizon: "3 años, hasta la venta del campo…",
  liquidity: "Necesita USD 50.000 en marzo 2027…",
  benchmark: "MEP, inflación, Lecaps…",
};
const KEYS = Object.keys(LABELS) as (keyof ClientContext)[];

function useNotebook(clientId: string) {
  return useQuery({
    queryKey: ["client-notebook", clientId],
    queryFn: () => getRepository().getClientNotebook(clientId),
  });
}

/**
 * Lo que sabés del cliente y sigue valiendo: mandato, contexto e indicaciones
 * vigentes del asesor. Un solo lugar, arriba de la ficha.
 */
export function ClientContextCard({
  client,
  indications = [],
}: {
  client: Pick<Client, "id" | "liquidityNote" | "horizonMonths">;
  indications?: AdvisorRequest[];
}) {
  const query = useNotebook(client.id);
  if (query.isPending) return <p className="text-sm text-muted-foreground">Cargando contexto…</p>;
  if (query.error)
    return (
      <div role="alert">
        No se pudo cargar el contexto.{" "}
        <Button variant="outline" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  return (
    <ContextEditor
      key={client.id}
      client={client}
      notebook={query.data}
      indications={indications}
    />
  );
}

function ContextEditor({
  client,
  notebook,
  indications,
}: {
  client: Pick<Client, "id" | "liquidityNote" | "horizonMonths">;
  notebook: Notebook;
  indications: AdvisorRequest[];
}) {
  const cache = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [context, setContext] = useState(notebook.context);
  const save = useRepoMutation(
    (repo, _: void) => repo.saveClientContext(client.id, context, notebook.updatedAt),
    {
      success: "Contexto guardado",
      invalidate: [],
      onSuccess: (result) => {
        cache.setQueryData(["client-notebook", client.id], result);
        setEditing(false);
      },
    },
  );
  const filled = KEYS.filter((k) => notebook.context[k].trim());
  const empty = KEYS.filter((k) => !notebook.context[k].trim());
  return (
    <SectionCard
      title="Contexto del cliente"
      description="Lo que sigue valiendo. Si algo cambia, actualizalo acá; lo puntual va en Notas."
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => {
            setContext(notebook.context);
            setEditing(!editing);
          }}
        >
          {editing ? "Cancelar" : "Editar"}
        </Button>
      }
    >
      {(client.liquidityNote || client.horizonMonths) && (
        <div className="mb-3 rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Mandato</p>
          {client.liquidityNote && <p className="whitespace-pre-wrap">{client.liquidityNote}</p>}
          {client.horizonMonths ? (
            <p className="text-xs text-muted-foreground">
              Horizonte del mandato: {client.horizonMonths} meses
            </p>
          ) : null}
        </div>
      )}
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {KEYS.map((key) => (
            <label key={key} className="space-y-1 text-sm">
              <span>{LABELS[key]}</span>
              <Textarea
                rows={2}
                maxLength={1000}
                disabled={save.isPending}
                value={context[key]}
                placeholder={HINTS[key]}
                onChange={(e) => setContext((old) => ({ ...old, [key]: e.target.value }))}
              />
            </label>
          ))}
          <Button
            className="justify-self-start"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Guardando…" : "Guardar contexto"}
          </Button>
        </div>
      ) : (
        <>
          {filled.length > 0 && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {filled.map((key) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{LABELS[key]}</dt>
                  <dd className="whitespace-pre-wrap">{notebook.context[key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {empty.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sin cargar: {empty.map((k) => LABELS[k].toLowerCase()).join(", ")}.
            </p>
          )}
          {notebook.updatedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Actualizado {formatDateTime(notebook.updatedAt)}
            </p>
          )}
        </>
      )}
      {save.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      {indications.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Indicaciones vigentes del asesor
          </p>
          <div className="grid gap-3 border-l-2 border-amber-400 pl-3">
            {indications.map((r) => (
              <RequestRow key={r.id} request={r} showClient={false} />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/** Lo que pasó y cuándo. Solo tuyas; lo del asesor llega por sus pedidos. */
export function ClientNotes({ clientId }: { clientId: string }) {
  const query = useNotebook(clientId);
  const cache = useQueryClient();
  const [body, setBody] = useState("");
  const note = useRepoMutation(
    (repo, _: void) => repo.addClientNote(clientId, { body, source: "propia" }),
    {
      success: "Nota guardada",
      invalidate: [],
      onSuccess: (result) => {
        cache.setQueryData<Notebook>(["client-notebook", clientId], (old) =>
          old ? { ...old, notes: [result, ...old.notes] } : old,
        );
        setBody("");
      },
    },
  );
  const notes = query.data?.notes ?? [];
  const shown = notes.slice(0, 5),
    older = notes.slice(5);
  const item = (n: (typeof notes)[number]) => (
    <li key={n.id} className="border-l-2 pl-3">
      <p className="text-xs text-muted-foreground">
        {formatDateTime(n.at)}
        {n.source === "asesor" ? " · me dijo el asesor" : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
    </li>
  );
  return (
    <SectionCard title={`Notas${notes.length ? ` · ${notes.length}` : ""}`}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() && !note.isPending) note.mutate();
        }}
      >
        <Textarea
          aria-label="Nueva nota"
          rows={2}
          maxLength={4000}
          value={body}
          disabled={note.isPending}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Lo que pasó o te contaron. Queda con fecha."
        />
        <Button variant="outline" size="sm" disabled={!body.trim() || note.isPending}>
          {note.isPending ? "Guardando…" : "Agregar nota"}
        </Button>
        {note.error && (
          <p role="alert" className="text-sm text-destructive">
            {note.error.message}
          </p>
        )}
      </form>
      {query.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Cargando notas…</p>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay notas.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map(item)}
          {older.length > 0 && (
            <li>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Notas anteriores · {older.length}
                </summary>
                <ul className="mt-3 space-y-3">{older.map(item)}</ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
