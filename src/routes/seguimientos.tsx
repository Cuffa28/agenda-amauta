import { CalendarDays, CalendarPlus, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { useSuspenseQueries } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader, SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarAction } from '@/components/CalendarAction';
import { GoogleConnection } from '@/integrations/google/GoogleConnection';
import { followUpsQuery, reviewsQuery, clientsQuery, pendingsQuery } from '@/data/queries';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { buildFollowUpPreview } from '@/domain/follow-up';
import { todayInBuenosAires } from '@/domain/dates';
import { followUpInputSchema, type FollowUpInput } from '@/domain/schemas';

export const Route = createFileRoute('/seguimientos')({ ssr: false, component: FollowUps });
function FollowUps() {
  const [{ data: items }, { data: reviews }, { data: clients }, { data: pendings }] = useSuspenseQueries({
    queries: [followUpsQuery(), reviewsQuery(), clientsQuery(), pendingsQuery()],
  });
  const [kind, setKind] = useState<'seguimiento' | 'bloque'>('seguimiento'), [source, setSource] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('Seguimiento de cartera'), [date, setDate] = useState(todayInBuenosAires()), [time, setTime] = useState('10:00'), [duration, setDuration] = useState(30), [error, setError] = useState('');
  const review = source.startsWith('r:') ? reviews.find(r => r.id === source.slice(2)) : undefined;
  const pending = source.startsWith('p:') ? pendings.find(p => p.id === source.slice(2)) : undefined;
  const link = kind === 'bloque' ? { kind: 'bloque', clientIds: selected } : pending ? { kind: 'pendiente', pendingId: pending.id } : { kind: review?.decision?.type === 'proponer_cambio' ? 'propuesta' : 'revision', reviewId: review?.id || '' };
  const valid = followUpInputSchema.safeParse({ clientId: kind === 'bloque' ? selected[0] || '' : pending?.clientId || review?.clientId || '', title, link, date, time, durationMinutes: duration });
  const preview = valid.success ? buildFollowUpPreview(valid.data) : null;
  const save = useRepoMutation((repo, input: FollowUpInput) => repo.createFollowUp(input), { invalidate: ['follow-ups'], success: 'Preparación guardada. Revisá y confirmá el evento debajo.' });
  const name = (id: string) => clients.find(c => c.id === id)?.name || id;
  return <><PageHeader eyebrow="Continuidad" title="Dale lugar al próximo paso" description="Tiempo para revisar. Una fecha para volver a conversar."/>
    <GoogleConnection/>
    <SectionCard title="Preparar evento" description="Elegí qué querés trabajar y revisá fecha, hora y duración antes de confirmar."><form className="mt-5 grid gap-4" onSubmit={e => { e.preventDefault(); if (valid.success) { setError(''); save.mutate(valid.data); } else setError(valid.error.issues.map(i => i.message).join(' · ')); }}>
      <div className="event-kind-grid">{([{value:'seguimiento',label:'Agendar seguimiento',sub:'Retomar una propuesta o un pendiente.',icon:CalendarPlus},{value:'bloque',label:'Bloque de revisión',sub:'Reservar tiempo para varias carteras.',icon:Clock3}] as const).map(({value,label,sub,icon:Icon})=><button type="button" className="event-kind" aria-pressed={kind===value} key={value} onClick={()=>{setKind(value);setTitle(value==='bloque'?'Bloque de revisión de carteras':'Seguimiento de cartera');}}><Icon size={20} strokeWidth={1.4}/><strong>{label}</strong><span>{sub}</span></button>)}</div>
      {kind === 'bloque' ? <fieldset className="max-h-56 overflow-auto rounded border p-3"><legend>Carteras del bloque · {selected.length} seleccionadas</legend>{clients.map(c => <label className="flex gap-2 p-1 text-sm" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e => setSelected(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id))}/>{c.id} · {c.name}</label>)}</fieldset> : <label>Propuesta, revisión o pendiente<select className="block w-full rounded border p-2" value={source} onChange={e => setSource(e.target.value)} required><option value="">Elegí la tarea concreta</option>{reviews.map(r => <option key={r.id} value={'r:'+r.id}>{name(r.clientId)} · {r.month} · {r.decision?.type === 'proponer_cambio' ? 'Propuesta' : 'Revisión'}</option>)}{pendings.filter(p => p.status === 'abierto').map(p => <option key={p.id} value={'p:'+p.id}>{name(p.clientId)} · Pendiente: {p.description}</option>)}</select></label>}
      <label>Título<Input value={title} onChange={e => setTitle(e.target.value)} required/></label>
      <div className="grid gap-3 sm:grid-cols-3"><label>Fecha<Input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>Hora<Input type="time" value={time} onChange={e => setTime(e.target.value)}/></label><label>Minutos<Input type="number" min={15} max={480} value={duration} onChange={e => setDuration(Number(e.target.value))}/></label></div>
      {preview && <p className="event-preview">{preview.dateLabel} · {preview.startTime}–{preview.endTime} · {preview.durationLabel} · {preview.timezoneLabel} · sin invitados</p>}
      {error && <p role="alert">{error}</p>}<Button disabled={save.isPending}>Guardar preparación</Button>
    </form></SectionCard>
    <div className="mt-7"><h2 className="mb-4 text-lg font-semibold">En tu agenda <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length} preparados</span></h2>{items.length === 0 && <div className="surface-card empty-state"><span className="empty-state-icon"><CalendarDays size={18}/></span><p>Tu próximo bloque o seguimiento empieza acá.</p></div>}<div className="grid gap-4">{items.map(item => <SectionCard key={item.id} title={item.title}>
      <p>{item.date} · {item.time} · {item.durationMinutes} min · {item.link.kind === 'bloque' ? item.link.clientIds.map(name).join(', ') : name(item.clientId)}</p>
      <CalendarAction item={item} description={'Agenda Amauta\n'+(item.link.kind === 'bloque' ? item.link.clientIds.map(id => `${id} · ${name(id)}`).join('\n') : `${item.clientId} · ${name(item.clientId)}`)+'\n'+window.location.origin+'/clientes/'+encodeURIComponent(item.clientId)}/>
    </SectionCard>)}</div></div>
  </>;
}
