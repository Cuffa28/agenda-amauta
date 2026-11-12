import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { requireAgendaSession } from '@/data/supabase/client';
import { mapPosition } from '@/data/supabase/mappers';
import { describeDecision } from '@/domain/decision';
import { RotationPanel } from '@/components/ficha/RotationPanel';
import { PositionHistory } from '@/components/ficha/PositionHistory';
import { ClientHeader } from '@/components/ficha/ClientHeader';
import { PositionEditor } from '@/components/ficha/PositionEditor';
import { PositionCard } from '@/components/ficha/PositionCard';
import { ReviewPanel } from '@/components/ficha/ReviewPanel';
import { PendingsPanel } from '@/components/ficha/PendingsPanel';
import { EmailDraftPanel } from '@/components/ficha/EmailDraftPanel';
import { SectionCard } from '@/components/PageHeader';
import { advisorsQuery, clientsQuery, positionsQuery, reviewsQuery, pendingsQuery, marketViewQuery, draftsQuery } from '@/data/queries';
import { portfolioMonthStatus } from '@/domain/coverage';
import { currentMonthInBuenosAires, todayInBuenosAires } from '@/domain/dates';
import { monthSearchSchema } from '@/lib/search';

export const Route = createFileRoute('/clientes/$clientId')({ ssr: false, validateSearch: monthSearchSchema, component: ClientPage });
function ClientPage() {
  const { clientId } = Route.useParams(); const { mes } = Route.useSearch(); const month = mes ?? currentMonthInBuenosAires();
  const { data: clients } = useSuspenseQuery(clientsQuery()); const { data: advisors } = useSuspenseQuery(advisorsQuery());
  const { data: positions } = useSuspenseQuery(positionsQuery()); const { data: reviews } = useSuspenseQuery(reviewsQuery());
  const { data: pendings } = useSuspenseQuery(pendingsQuery()); const { data: marketView } = useSuspenseQuery(marketViewQuery()); const { data: drafts } = useSuspenseQuery(draftsQuery());
  const client = clients.find(c => c.id === clientId), position = positions.find(p => p.clientId === clientId) ?? null;
  const review = reviews.find(r => r.clientId === clientId && r.month === month) ?? null;
  const historical = useQuery({ queryKey: ['review-position', review?.positionId], enabled: !!review?.positionId && review.positionId !== position?.id,
    queryFn: async () => { const { supabase } = await requireAgendaSession(); const { data, error } = await supabase.from('agenda_positions').select('*').eq('id', review!.positionId!).eq('client_id', clientId).single(); if (error) throw error; return mapPosition(data); } });
  if (!client) return <p>Cliente no encontrado.</p>;
  const advisor = advisors.find(a => a.id === client.advisorId), status = portfolioMonthStatus(client, month, reviews, pendings, todayInBuenosAires());
  const reviewPosition = review?.positionId === position?.id ? position : historical.data || null;
  const prior = reviews.filter(r => r.clientId === clientId && r.month < month && r.status === 'cerrada' && r.decision).sort((a,b) => b.month.localeCompare(a.month))[0];
  const previousConclusion = review?.previousConclusion || (prior?.decision ? describeDecision(prior.decision) : null);
  return <div className="grid gap-6">
    <ClientHeader client={client} advisor={advisor} advisors={advisors} status={status}/>
    {client.liquidityNote && <SectionCard title="Mandato del cliente"><p>{client.liquidityNote}</p></SectionCard>}
    <PositionCard position={position}/>
    {position && <><PositionHistory position={position}/><RotationPanel key={position.id} position={position}/></>}
    <PositionEditor clientId={clientId}/>
    <SectionCard title="Conclusión anterior"><p>{previousConclusion ?? 'Sin conclusión anterior registrada para esta revisión.'}</p></SectionCard>
    <ReviewPanel clientId={clientId} month={month} status={status} marketView={marketView}/>
    <PendingsPanel clientId={clientId} review={review} pendings={pendings.filter(p => p.clientId === clientId)} reviewsById={new Map(reviews.map(r => [r.id,r]))} today={todayInBuenosAires()}/>
    {historical.error && <p role="alert">No se pudo recuperar la posición utilizada en esta revisión. El borrador no se habilita hasta recuperarla.</p>}
    {review && advisor && (!review.positionId || reviewPosition) && <EmailDraftPanel key={review.id} source={{client,advisor,position:reviewPosition,review}} saved={drafts.find(d => d.reviewId === review.id)}/>}
  </div>;
}
