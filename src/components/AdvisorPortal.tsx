import { useState } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { AmautaBrand } from "@/components/AmautaBrand";
import { Button } from "@/components/ui/button";
import { requestClientsQuery, requestsQuery } from "@/data/queries";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { formatDate } from "@/domain/dates";
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type AdvisorRequest,
  type RequestKind,
} from "@/domain/request";

/**
 * Única pantalla de un asesor: elegir un cliente suyo, dejar un pedido o una
 * indicación y consultar su estado. No ve revisiones, notas, tareas ni carteras.
 */
export function AdvisorPortal({ email, onSignOut }: { email: string; onSignOut?: () => void }) {
  const [{ data: clients }, { data: requests }] = useSuspenseQueries({
    queries: [requestClientsQuery(), requestsQuery()],
  });
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const [clientId, setClientId] = useState(""),
    [kind, setKind] = useState<RequestKind>("pedido"),
    [body, setBody] = useState(""),
    [date, setDate] = useState(""),
    [sent, setSent] = useState<AdvisorRequest | null>(null);
  const create = useRepoMutation(
    (repo, _: void) =>
      repo.createRequest({
        clientId,
        kind,
        body,
        desiredDate: kind === "pedido" && date ? date : null,
      }),
    {
      invalidate: ["requests"],
      onSuccess: (r) => {
        setSent(r);
        setBody("");
        setDate("");
      },
    },
  );
  const retire = useRepoMutation((repo, r: AdvisorRequest) => repo.retireIndication(r.id), {
    success: "Indicación marcada como ya no aplica",
    invalidate: ["requests"],
  });
  return (
    <div className="mx-auto grid max-w-2xl gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <AmautaBrand />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{email}</span>
          {onSignOut && (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Cerrar sesión
            </Button>
          )}
        </div>
      </header>
      <section className="surface-card grid gap-4 p-5">
        <div>
          <h1 className="text-xl font-semibold">Dejale un pedido a Facundo</h1>
          <p className="text-sm text-muted-foreground">
            Elegí el cliente y escribí qué necesitás. Facundo lo ve en su agenda y en la ficha del
            cliente.
          </p>
        </div>
        <form
          className="grid gap-3"
          aria-label="Nuevo pedido"
          onSubmit={(e) => {
            e.preventDefault();
            if (clientId && body.trim() && !create.isPending) {
              setSent(null);
              create.mutate();
            }
          }}
        >
          <label className="grid gap-1 text-sm">
            Cliente
            <select
              className="rounded-lg border bg-background px-2 py-2"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">Elegí un cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap gap-2" aria-label="Tipo">
            {(["pedido", "indicacion"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "outline"}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {REQUEST_KIND_LABELS[k]}
              </Button>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            {kind === "pedido"
              ? "Algo concreto para hacer, por ejemplo un resumen o una consulta."
              : "Algo que vale de acá en adelante para este cliente, por ejemplo cómo prefiere recibir la información."}
          </p>
          <label className="grid gap-1 text-sm">
            {kind === "pedido" ? "Pedido" : "Indicación"}
            <textarea
              className="min-h-24 rounded-lg border bg-background px-3 py-2"
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          {kind === "pedido" && (
            <label className="grid gap-1 text-sm">
              Para cuándo (opcional)
              <input
                type="date"
                className="w-fit rounded-lg border bg-background px-2 py-1.5"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          <Button className="w-fit" disabled={!clientId || !body.trim() || create.isPending}>
            {create.isPending ? "Enviando…" : "Enviar"}
          </Button>
          {sent && (
            <p role="status" className="text-sm text-emerald-700">
              Quedó registrado: {REQUEST_KIND_LABELS[sent.kind].toLowerCase()} sobre{" "}
              {names.get(sent.clientId) || sent.clientId}. Estado:{" "}
              {REQUEST_STATUS_LABELS[sent.status]}.
            </p>
          )}
          {create.error && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
        </form>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-medium">Lo que dejaste · {requests.length}</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Todavía no dejaste pedidos.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {requests.map((r) => (
              <li key={r.id} className="border-l-2 pl-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {names.get(r.clientId) || r.clientId} · {REQUEST_KIND_LABELS[r.kind]} ·{" "}
                  {formatDate(r.createdAt.slice(0, 10))}
                  {r.desiredDate ? ` · para el ${formatDate(r.desiredDate)}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{r.body}</p>
                <p className="mt-1 flex items-center gap-2 text-xs">
                  <span className="font-medium">{REQUEST_STATUS_LABELS[r.status]}</span>
                  {r.kind === "indicacion" && r.status === "vigente" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={retire.isPending}
                      onClick={() => retire.mutate(r)}
                    >
                      Ya no aplica
                    </Button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
