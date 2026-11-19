import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useRepoMutation } from "@/data/use-repo-mutation";
import { formatDate } from "@/domain/dates";
import {
  isNewRequest,
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type AdvisorRequest,
} from "@/domain/request";

/** Nombre corto del asesor a partir del correo: "florencia@…" → "Florencia". */
export function authorLabel(email: string) {
  const name = email.split("@")[0] || email;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function NewBadge() {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Nuevo
    </span>
  );
}

function useRequestActions() {
  const status = useRepoMutation(
    (repo, v: { r: AdvisorRequest; status: "en_curso" | "resuelto" | "recibido" }) =>
      repo.setRequestStatus(v.r.id, v.status, v.r.updatedAt),
    { invalidate: ["requests"] },
  );
  const seen = useRepoMutation(
    (repo, r: AdvisorRequest) => repo.markRequestSeen(r.id, r.updatedAt),
    { invalidate: ["requests"] },
  );
  const retire = useRepoMutation((repo, r: AdvisorRequest) => repo.retireIndication(r.id), {
    success: "Indicación marcada como ya no aplica",
    invalidate: ["requests"],
  });
  return {
    status,
    seen,
    retire,
    busy: status.isPending || seen.isPending || retire.isPending,
  };
}

/** Pedido o indicación, tal como lo gestiona el owner (Mi semana y ficha). */
export function RequestRow({
  request: r,
  clientName,
  showClient = true,
}: {
  request: AdvisorRequest;
  clientName?: string | undefined;
  showClient?: boolean;
}) {
  const { status, seen, retire, busy } = useRequestActions();
  const open = r.status === "recibido" || r.status === "en_curso";
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {isNewRequest(r) && <NewBadge />}
        <span>{REQUEST_KIND_LABELS[r.kind]}</span>
        <span>· {authorLabel(r.authorEmail)}</span>
        <span>· {formatDate(r.createdAt.slice(0, 10))}</span>
        {r.desiredDate && <span>· para el {formatDate(r.desiredDate)}</span>}
        {showClient && (
          <Link
            to="/clientes/$clientId"
            params={{ clientId: r.clientId }}
            className="hover:underline"
          >
            · {clientName || r.clientId}
          </Link>
        )}
        <span className="font-medium text-foreground">· {REQUEST_STATUS_LABELS[r.status]}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {isNewRequest(r) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => seen.mutate(r)}
          >
            Visto
          </Button>
        )}
        {r.kind === "pedido" && r.status === "recibido" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => status.mutate({ r, status: "en_curso" })}
          >
            En curso
          </Button>
        )}
        {r.kind === "pedido" && open && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => status.mutate({ r, status: "resuelto" })}
          >
            Resuelto
          </Button>
        )}
        {r.kind === "pedido" && r.status === "resuelto" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => status.mutate({ r, status: "en_curso" })}
          >
            Reabrir
          </Button>
        )}
        {r.kind === "indicacion" && r.status === "vigente" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => retire.mutate(r)}
          >
            Ya no aplica
          </Button>
        )}
      </div>
    </div>
  );
}

/** Vigentes: se muestran en el Contexto del cliente. */
export const vigentIndications = (requests: AdvisorRequest[], clientId: string) =>
  requests.filter(
    (r) => r.clientId === clientId && r.kind === "indicacion" && r.status === "vigente",
  );

/** Ficha: pedidos abiertos del asesor y, plegado, lo cerrado. Las indicaciones vigentes van al Contexto. */
export function ClientRequests({
  clientId,
  requests,
}: {
  clientId: string;
  requests: AdvisorRequest[];
}) {
  const mine = requests.filter(
    (r) => r.clientId === clientId && !(r.kind === "indicacion" && r.status === "vigente"),
  );
  if (!mine.length) return null;
  const open = mine.filter((r) => r.status === "recibido" || r.status === "en_curso");
  const closed = mine.filter((r) => !open.includes(r));
  const fresh = mine.filter(isNewRequest).length;
  return (
    <section id="pedidos" className="surface-card scroll-mt-4 p-4">
      <h2 className="text-sm font-medium">
        Pedidos del asesor{open.length ? ` · ${open.length} abiertos` : ""}
        {fresh > 0 && (
          <span className="ml-2 align-middle">
            <NewBadge />
          </span>
        )}
      </h2>
      <div className="mt-3 grid gap-4">
        {open.map((r) => (
          <RequestRow key={r.id} request={r} showClient={false} />
        ))}
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay pedidos abiertos.</p>
        )}
        {closed.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Resueltos y sin vigencia · {closed.length}
            </summary>
            <div className="mt-2 grid gap-3">
              {closed.map((r) => (
                <RequestRow key={r.id} request={r} showClient={false} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
