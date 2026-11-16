import { QuickReview } from "@/components/ficha/QuickReview";
import { ClientNotebook } from "@/components/ficha/ClientNotebook";
import { PersonalReviewSchedule } from "@/components/ficha/PersonalReviewSchedule";
import { useState } from "react";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getRepository } from "@/data";
import { describeDecision } from "@/domain/decision";
import { RotationPanel } from "@/components/ficha/RotationPanel";
import { PositionHistory } from "@/components/ficha/PositionHistory";
import { ClientHeader } from "@/components/ficha/ClientHeader";
import { PositionEditor } from "@/components/ficha/PositionEditor";
import { PositionCard } from "@/components/ficha/PositionCard";
import { DetailedReviewPanel } from "@/components/ficha/ReviewPanel";
import { PendingsPanel } from "@/components/ficha/PendingsPanel";
import { EmailDraftPanel } from "@/components/ficha/EmailDraftPanel";
import { SectionCard } from "@/components/PageHeader";
import {
  advisorsQuery,
  clientsQuery,
  positionsQuery,
  reviewsQuery,
  pendingsQuery,
  marketViewQuery,
  draftsQuery,
} from "@/data/queries";
import { portfolioMonthStatus } from "@/domain/coverage";
import { currentMonthInBuenosAires, todayInBuenosAires } from "@/domain/dates";
import { monthSearchSchema } from "@/lib/search";

export const Route = createFileRoute("/clientes/$clientId")({
  ssr: false,
  validateSearch: monthSearchSchema,
  component: ClientPage,
});
function ClientPage() {
  const { clientId } = Route.useParams();
  const { mes } = Route.useSearch();
  const month = mes ?? currentMonthInBuenosAires();
  const [
    { data: clients },
    { data: advisors },
    { data: positions },
    { data: reviews },
    { data: pendings },
    { data: marketView },
    { data: drafts },
  ] = useSuspenseQueries({
    queries: [
      clientsQuery(),
      advisorsQuery(),
      positionsQuery(clientId),
      reviewsQuery(clientId),
      pendingsQuery(clientId),
      marketViewQuery(),
      draftsQuery(clientId),
    ],
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const client = clients.find((c) => c.id === clientId),
    position = positions.find((p) => p.clientId === clientId) ?? null;
  const review = reviews.find((r) => r.clientId === clientId && r.month === month) ?? null;
  const historical = useQuery({
    queryKey: ["review-position", review?.positionId],
    enabled: !!review?.positionId && review.positionId !== position?.id,
    queryFn: async () => {
      const positions = await getRepository().listPositionHistory(clientId);
      const found = positions.find((p) => p.id === review!.positionId);
      if (!found) throw Error("Posición no encontrada.");
      return found;
    },
  });
  if (!client) return <p>Cliente no encontrado.</p>;
  const advisor = advisors.find((a) => a.id === client.advisorId),
    status = portfolioMonthStatus(client, month, reviews, pendings, todayInBuenosAires());
  const reviewPosition = review?.positionId === position?.id ? position : historical.data || null;
  const prior = reviews
    .filter(
      (r) => r.clientId === clientId && r.month < month && r.status === "cerrada" && r.decision,
    )
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const previousConclusion =
    review?.previousConclusion || (prior?.decision ? describeDecision(prior.decision) : null);
  return (
    <div className="grid gap-6">
      <ClientHeader client={client} advisor={advisor} advisors={advisors} status={status} />
      <nav
        aria-label="Secciones de la ficha"
        className="flex flex-wrap gap-4 text-sm text-muted-foreground"
      >
        <a href="#revision">Mi revisión</a>
        <a href="#contexto">Contexto y notas</a>
        <a href="#posicion">Cartera y PDF</a>
        <a href="#mi-agenda">Agendar</a>
      </nav>
      {client.liquidityNote && (
        <SectionCard title="Mandato del cliente">
          <p>{client.liquidityNote}</p>
        </SectionCard>
      )}
      <section id="revision" className="scroll-mt-4">
        <QuickReview
          key={clientId + month + (review?.status || "")}
          clientId={clientId}
          month={month}
          review={review}
        />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Análisis detallado y datos a confirmar
          </summary>
          <div className="mt-3">
            <DetailedReviewPanel
              clientId={clientId}
              month={month}
              status={status}
              marketView={marketView}
              position={position}
            />
          </div>
        </details>
      </section>
      <section id="contexto">
        <ClientNotebook clientId={clientId} />
      </section>
      <section id="mi-agenda" className="scroll-mt-4">
        <PersonalReviewSchedule key={clientId} client={client} />
      </section>
      {previousConclusion && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Revisión anterior</summary>
          <p className="mt-2">{previousConclusion}</p>
        </details>
      )}
      <details className="surface-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Historial de revisiones</summary>
        <div className="mt-3 grid gap-3">
          {reviews
            .filter((r) => r.status === "cerrada" && r.decision)
            .map((r) => (
              <div key={r.id} className="border-l-2 pl-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {r.closedAt?.slice(0, 10)} · {r.month}
                </p>
                <p>{r.decision ? describeDecision(r.decision) : ""}</p>
                {r.analysis && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.analysis}</p>
                )}
              </div>
            ))}
        </div>
      </details>
      <section id="posicion" className="grid scroll-mt-4 gap-4">
        <PositionCard position={position} />
        <PositionEditor key={clientId} clientId={clientId} />
      </section>
      {historical.error && (
        <p role="alert">
          No se pudo recuperar la posición utilizada en esta revisión. El borrador no se habilita
          hasta recuperarla.
        </p>
      )}
      <details id="borrador" className="surface-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Preparar borrador al asesor
        </summary>
        <div className="mt-4">
          {review && (!review.positionId || reviewPosition) ? (
            <EmailDraftPanel
              key={review.id}
              source={{
                client,
                advisor: advisor ?? { id: client.advisorId, name: "Sin asignar", email: "" },
                position: reviewPosition,
                review,
              }}
              saved={drafts.find((d) => d.reviewId === review.id)}
            />
          ) : (
            <SectionCard title="Borrador para el asesor">
              <p className="text-sm">
                {!review
                  ? "Iniciá la revisión para preparar el correo con destinatario y asunto."
                  : !advisor
                    ? "Asigná un asesor desde Editar ficha."
                    : "Recuperando la posición utilizada…"}
              </p>
            </SectionCard>
          )}
        </div>
      </details>
      <details id="pendientes" className="surface-card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Pendientes de esta cuenta · {pendings.filter((p) => p.status === "abierto").length}
        </summary>
        <div className="mt-4">
          <PendingsPanel
            clientId={clientId}
            review={review}
            pendings={pendings}
            reviewsById={new Map(reviews.map((r) => [r.id, r]))}
            today={todayInBuenosAires()}
          />
        </div>
      </details>
      {position && (
        <details
          className="surface-card p-4"
          onToggle={(e) => {
            if (e.currentTarget.open) setShowAdvanced(true);
          }}
        >
          <summary className="cursor-pointer font-medium">
            Historial de posiciones y simulador de cambios
          </summary>
          {showAdvanced && (
            <div className="mt-4 grid gap-4">
              <PositionHistory position={position} />
              <RotationPanel key={position.id} position={position} />
            </div>
          )}
        </details>
      )}
    </div>
  );
}
