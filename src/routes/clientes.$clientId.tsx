import {
  BoardStageSelect,
  StageNote,
  useMissedPrevious,
  useStageChange,
} from "@/components/BoardProgress";
import { RecommendationTracker } from "@/components/RecommendationTracker";
import { ClientTasks } from "@/components/Tasks";
import { ClientRequests, vigentIndications } from "@/components/Requests";
import { boardStage } from "@/domain/board";
import { QuickReview } from "@/components/ficha/QuickReview";
import { ClientAnotar, ClientContextCard } from "@/components/ficha/ClientNotebook";
import { ClientTimeline } from "@/components/ficha/ClientTimeline";
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
import { ReviewSources } from "@/components/ficha/ReviewPanel";
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
  boardQuery,
  tasksQuery,
  requestsQuery,
} from "@/data/queries";
import { portfolioMonthStatus } from "@/domain/coverage";
import {
  currentMonthInBuenosAires,
  formatDate,
  formatMonthLabel,
  todayInBuenosAires,
} from "@/domain/dates";
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
    { data: entries },
    { data: tasks },
    { data: requests },
  ] = useSuspenseQueries({
    queries: [
      clientsQuery(),
      advisorsQuery(),
      positionsQuery(clientId),
      reviewsQuery(clientId),
      pendingsQuery(clientId),
      marketViewQuery(),
      draftsQuery(clientId),
      boardQuery(month),
      tasksQuery(),
      requestsQuery(),
    ],
  });
  const { move, change, dialog } = useStageChange(month);
  const missed = useMissedPrevious(month);
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
    status = portfolioMonthStatus(client, month, reviews, pendings, todayInBuenosAires(), entries);
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
        <a href="#contexto">Contexto</a>
        <a href="#revision">Mi revisión</a>
        <a href="#historial">Historial</a>
        <a href="#tareas">Tareas</a>
        <a href="#posicion">Cartera y PDF</a>
        <a href="#mi-agenda">Agendar</a>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        {dialog}
        <span className="text-sm text-muted-foreground">Avance del mes</span>
        <BoardStageSelect
          value={boardStage(
            review,
            entries.find((e) => e.clientId === clientId),
          )}
          disabled={move.isPending}
          onChange={(stage) =>
            change({
              clientId,
              name: client.name,
              stage,
              entry: entries.find((e) => e.clientId === clientId),
            })
          }
        />
        <StageNote
          stage={boardStage(
            review,
            entries.find((e) => e.clientId === clientId),
          )}
          entry={entries.find((e) => e.clientId === clientId)}
          review={review}
          missed={missed(clientId)}
        />
        {move.error && (
          <p role="alert" className="text-sm text-destructive">
            {move.error.message}
          </p>
        )}
      </div>
      <section id="contexto" className="scroll-mt-4">
        <ClientContextCard client={client} indications={vigentIndications(requests, clientId)} />
      </section>
      <ClientAnotar clientId={clientId} />
      <ClientRequests clientId={clientId} requests={requests} />
      <section id="revision" className="scroll-mt-4">
        <QuickReview
          key={clientId + month + (review?.status || "")}
          clientId={clientId}
          month={month}
          review={review}
          progress={boardStage(
            review,
            entries.find((e) => e.clientId === clientId),
          )}
          previous={previousConclusion}
        />
        <div className="mt-3">
          <RecommendationTracker review={review} />
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Visión de mercado y posición usadas
          </summary>
          <div className="mt-3">
            <ReviewSources review={review} marketView={marketView} position={position} />
          </div>
        </details>
      </section>
      <section id="tareas" className="scroll-mt-4">
        <ClientTasks clientId={clientId} tasks={tasks} />
      </section>
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
      <section id="mi-agenda" className="scroll-mt-4">
        <PersonalReviewSchedule key={clientId} client={client} />
      </section>
      <section id="historial" className="scroll-mt-4">
        <ClientTimeline clientId={clientId} reviews={reviews} requests={requests} tasks={tasks} />
      </section>
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
