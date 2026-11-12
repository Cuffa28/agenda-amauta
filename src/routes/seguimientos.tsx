import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader,SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { followUpsQuery,reviewsQuery,clientsQuery } from '@/data/queries';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { buildFollowUpPreview } from '@/domain/follow-up';
import { todayInBuenosAires } from '@/domain/dates';
import { followUpInputSchema,type FollowUpInput } from '@/domain/schemas';

export const Route=createFileRoute('/seguimientos')({ssr:false,component:FollowUps});
function FollowUps(){
  const {data:items}=useSuspenseQuery(followUpsQuery());const {data:reviews}=useSuspenseQuery(reviewsQuery());const {data:clients}=useSuspenseQuery(clientsQuery());
  const [reviewId,setReviewId]=useState('');const [title,setTitle]=useState('Seguimiento de revisión');const [date,setDate]=useState(todayInBuenosAires());const [time,setTime]=useState('10:00');const [duration,setDuration]=useState(30);
  const review=reviews.find(r=>r.id===reviewId);const [error,setError]=useState('');
  const save=useRepoMutation((repo,input:FollowUpInput)=>repo.createFollowUp(input),{success:'Seguimiento preparado en Agenda; no se creó evento'});
  const valid=followUpInputSchema.safeParse({clientId:review?.clientId??'',title,link:{kind:'revision',reviewId},date,time,durationMinutes:duration});
  const preview=valid.success?buildFollowUpPreview(valid.data):null;
  return <><PageHeader title="Seguimientos" description="Vista previa en hora de Buenos Aires, sin invitados."/>
    <SectionCard title="Preparar seguimiento"><form className="grid gap-4" onSubmit={e=>{e.preventDefault();if(valid.success){setError('');save.mutate(valid.data);}else setError(valid.error.issues.map(i=>i.message).join(' · '));}}>
      <label>Revisión<select className="block w-full rounded border p-2" value={reviewId} onChange={e=>setReviewId(e.target.value)} required><option value="">Elegí una revisión</option>{reviews.map(r=><option key={r.id} value={r.id}>{clients.find(c=>c.id===r.clientId)?.name} · {r.month}</option>)}</select></label>
      <label>Título<Input value={title} onChange={e=>setTitle(e.target.value)} required/></label>
      <div className="grid grid-cols-3 gap-3"><label>Fecha<Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Hora<Input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label>Minutos<Input type="number" min={15} max={480} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label></div>
      {preview&&<p>{preview.dateLabel} · {preview.startTime}–{preview.endTime} · {preview.durationLabel} · {preview.timezoneLabel} · sin invitados</p>}
      {error&&<p role="alert">{error}</p>}<div className="flex gap-3"><Button disabled={save.isPending}>Guardar preparación</Button><Button type="button" disabled variant="outline">Calendar no conectado</Button></div>
    </form></SectionCard>
    <div className="mt-6 grid gap-4">{items.map(i=><SectionCard key={i.id} title={i.title}><p>{i.clientId} · {i.date} · {i.time} · {i.durationMinutes} min · sin invitados</p></SectionCard>)}</div>
  </>;
}
