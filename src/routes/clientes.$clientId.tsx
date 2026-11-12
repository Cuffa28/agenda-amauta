import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ClientHeader } from '@/components/ficha/ClientHeader';
import { PositionEditor } from '@/components/ficha/PositionEditor';
import { PositionCard } from '@/components/ficha/PositionCard';
import { ReviewPanel } from '@/components/ficha/ReviewPanel';
import { PendingsPanel } from '@/components/ficha/PendingsPanel';
import { EmailDraftPanel } from '@/components/ficha/EmailDraftPanel';
import { SectionCard } from '@/components/PageHeader';
import { advisorsQuery,clientsQuery,positionsQuery,reviewsQuery,pendingsQuery,marketViewQuery,draftsQuery } from '@/data/queries';
import { portfolioMonthStatus } from '@/domain/coverage';
import { currentMonthInBuenosAires,todayInBuenosAires } from '@/domain/dates';
import { monthSearchSchema } from '@/lib/search';

export const Route=createFileRoute('/clientes/$clientId')({ssr:false,validateSearch:monthSearchSchema,component:ClientPage});
function ClientPage(){
  const {clientId}=Route.useParams();const {mes}=Route.useSearch();const month=mes??currentMonthInBuenosAires();
  const {data:clients}=useSuspenseQuery(clientsQuery());const {data:advisors}=useSuspenseQuery(advisorsQuery());
  const {data:positions}=useSuspenseQuery(positionsQuery());const {data:reviews}=useSuspenseQuery(reviewsQuery());
  const {data:pendings}=useSuspenseQuery(pendingsQuery());const {data:marketView}=useSuspenseQuery(marketViewQuery());const {data:drafts}=useSuspenseQuery(draftsQuery());
  const client=clients.find(c=>c.id===clientId);if(!client)return <p>Cliente no encontrado.</p>;
  const advisor=advisors.find(a=>a.id===client.advisorId);const position=positions.find(p=>p.clientId===client.id)??null;
  const status=portfolioMonthStatus(client,month,reviews,pendings,todayInBuenosAires());const review=status.review;
  return <div className="grid gap-6"><ClientHeader client={client} advisor={advisor} advisors={advisors} status={status}/>
    <PositionCard position={position}/><PositionEditor clientId={clientId}/><SectionCard title="Conclusión anterior"><p>{review?.previousConclusion??'Sin conclusión anterior registrada para esta revisión.'}</p></SectionCard>
    <ReviewPanel clientId={clientId} month={month} status={status} marketView={marketView}/>
    <PendingsPanel clientId={clientId} review={review} pendings={pendings.filter(p=>p.clientId===clientId)} reviewsById={new Map(reviews.map(r=>[r.id,r]))} today={todayInBuenosAires()}/>
    {review&&advisor&&<EmailDraftPanel key={review.id} source={{client,advisor,position,review}} saved={drafts.find(d=>d.reviewId===review.id)}/>}
  </div>;
}
