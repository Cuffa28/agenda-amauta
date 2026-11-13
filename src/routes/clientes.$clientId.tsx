import { useState } from 'react';
import { useQuery, useSuspenseQueries } from '@tanstack/react-query';
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
  const [{ data: clients }, { data: advisors }, { data: positions }, { data: reviews }, { data: pendings }, { data: marketView }, { data: drafts }] = useSuspenseQueries({
    queries: [clientsQuery(), advisorsQuery(), positionsQuery(clientId), reviewsQuery(clientId), pendingsQuery(clientId), marketViewQuery(), draftsQuery(clientId)],
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    <nav aria-label="Secciones de la ficha" className="flex flex-wrap gap-3 text-sm">
      <a className="rounded border px-3 py-2 hover:bg-accent" href="#revision">1. Revisión</a>
      <a className="rounded border px-3 py-2 hover:bg-accent" href="#posicion">2. Posición y PDF</a>
      <a className="rounded border px-3 py-2 hover:bg-accent" href="#borrador">3. Borrador al asesor</a>
      <a className="rounded border px-3 py-2 hover:bg-accent" href="#pendientes">4. Pendientes</a>
    </nav>
    {client.liquidityNote && <SectionCard title="Mandato del cliente"><p>{client.liquidityNote}</p></SectionCard>}
    <section id="revision" className="scroll-mt-4">
      {!position && <p className="mb-3 rounded border bg-muted/40 p-3 text-sm">Todavía no hay posición cargada. Podés iniciar para pedir información o <a className="underline" href="#posicion">cargar el PDF</a> antes de documentar tu decisión.</p>}
      <ReviewPanel clientId={clientId} month={month} status={status} marketView={marketView} position={position}/>
    </section>
    {previousConclusion && <SectionCard title="Conclusión anterior"><p>{previousConclusion}</p></SectionCard>}
    <section id="posicion" className="grid scroll-mt-4 gap-4"><PositionCard position={position}/><PositionEditor key={clientId} clientId={clientId}/></section>
    {historical.error && <p role="alert">No se pudo recuperar la posición utilizada en esta revisión. El borrador no se habilita hasta recuperarla.</p>}
    <section id="borrador" className="scroll-mt-4">{review && (!review.positionId || reviewPosition)
      ? <EmailDraftPanel key={review.id} source={{client,advisor:advisor ?? {id:client.advisorId,name:'Sin asignar',email:''},position:reviewPosition,review}} saved={drafts.find(d => d.reviewId === review.id)}/>
      : <SectionCard title="Borrador para el asesor"><p className="text-sm">{!review ? 'Iniciá la revisión para preparar el correo con destinatario y asunto.' : !advisor ? 'Asigná un asesor desde Editar ficha.' : 'Recuperando la posición utilizada…'}</p></SectionCard>}</section>
    <section id="pendientes" className="scroll-mt-4"><PendingsPanel clientId={clientId} review={review} pendings={pendings} reviewsById={new Map(reviews.map(r => [r.id,r]))} today={todayInBuenosAires()}/></section>
    {position && <details className="surface-card p-4" onToggle={e => { if (e.currentTarget.open) setShowAdvanced(true); }}><summary className="cursor-pointer font-medium">Historial de posiciones y simulador de cambios</summary>{showAdvanced && <div className="mt-4 grid gap-4"><PositionHistory position={position}/><RotationPanel key={position.id} position={position}/></div>}</details>}
  </div>;
}
