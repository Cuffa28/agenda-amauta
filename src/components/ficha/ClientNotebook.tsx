import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRepository } from "@/data";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/domain/dates";
import type { ClientContext, ClientNotebook as Notebook } from "@/domain/client-notebook";

export function ClientNotebook({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ["client-notebook", clientId],
    queryFn: () => getRepository().getClientNotebook(clientId),
  });
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
  return <NotebookEditor key={clientId} clientId={clientId} notebook={query.data} />;
}
const labels: Record<keyof ClientContext, string> = {
  profile: "Perfil",
  objective: "Objetivo",
  horizon: "Horizonte",
  liquidity: "Liquidez necesaria",
  benchmark: "Benchmark",
};
function NotebookEditor({ clientId, notebook }: { clientId: string; notebook: Notebook }) {
  const cache = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [context, setContext] = useState(notebook.context);
  const [body, setBody] = useState("");
  const [source, setSource] = useState<"propia" | "asesor">("propia");
  const save = useRepoMutation(
    (repo, _: void) => repo.saveClientContext(clientId, context, notebook.updatedAt),
    {
      success: "Contexto guardado",
      invalidate: [],
      onSuccess: (result) => {
        cache.setQueryData(["client-notebook", clientId], result);
        setEditing(false);
      },
    },
  );
  const note = useRepoMutation((repo, _: void) => repo.addClientNote(clientId, { body, source }), {
    success: "Nota guardada",
    invalidate: [],
    onSuccess: (result) => {
      cache.setQueryData<Notebook>(["client-notebook", clientId], (old) =>
        old ? { ...old, notes: [result, ...old.notes] } : old,
      );
      setBody("");
    },
  });
  return (
    <SectionCard
      title="Contexto y notas"
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={save.isPending || note.isPending}
          onClick={() => {
            setContext(notebook.context);
            setEditing(!editing);
          }}
        >
          {editing ? "Cancelar" : "Editar contexto"}
        </Button>
      }
    >
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(labels) as (keyof ClientContext)[]).map((key) => (
            <label key={key} className="space-y-1 text-sm">
              <span>{labels[key]}</span>
              <Input
                maxLength={1000}
                disabled={save.isPending || note.isPending}
                value={context[key]}
                onChange={(e) => setContext((old) => ({ ...old, [key]: e.target.value }))}
              />
            </label>
          ))}
          <Button
            className="justify-self-start"
            disabled={save.isPending || note.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Guardando…" : "Guardar contexto"}
          </Button>
        </div>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {(Object.keys(labels) as (keyof ClientContext)[]).map((key) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{labels[key]}</dt>
              <dd className="whitespace-pre-wrap">{notebook.context[key] || "Sin definir"}</dd>
            </div>
          ))}
        </dl>
      )}
      {save.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <label htmlFor="note-source" className="text-sm">
            Nueva nota
          </label>
          <select
            id="note-source"
            className="rounded border bg-background p-2 text-sm"
            value={source}
            disabled={note.isPending}
            onChange={(e) => setSource(e.target.value as typeof source)}
          >
            <option value="propia">Mi comentario</option>
            <option value="asesor">Me dijo el asesor</option>
          </select>
        </div>
        <Textarea
          aria-label="Nota del cliente"
          rows={2}
          maxLength={4000}
          value={body}
          disabled={note.isPending}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Algo que querés recordar de este cliente…"
        />
        <Button
          variant="outline"
          disabled={!body.trim() || note.isPending}
          onClick={() => note.mutate()}
        >
          {note.isPending ? "Guardando…" : "Agregar nota"}
        </Button>
        {note.error && (
          <p role="alert" className="text-sm text-destructive">
            {note.error.message}
          </p>
        )}
        {notebook.notes.slice(0, 2).map((item) => (
          <div key={item.id} className="border-l-2 pl-3">
            <p className="text-xs text-muted-foreground">
              {item.source === "asesor" ? "Comentario del asesor" : "Mi comentario"} ·{" "}
              {formatDateTime(item.at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
          </div>
        ))}
        {notebook.notes.length > 2 && (
          <details>
            <summary className="cursor-pointer text-sm">
              Notas anteriores · {notebook.notes.length - 2}
            </summary>
            <div className="mt-3 space-y-3">
              {notebook.notes.slice(2).map((item) => (
                <div key={item.id} className="border-l-2 pl-3">
                  <p className="text-xs text-muted-foreground">
                    {item.source === "asesor" ? "Comentario del asesor" : "Mi comentario"} ·{" "}
                    {formatDateTime(item.at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </SectionCard>
  );
}
