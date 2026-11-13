import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { SectionCard } from '@/components/PageHeader';
import { CalendarAction } from '@/components/CalendarAction';
import { Field } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GoogleConnection } from '@/integrations/google/GoogleConnection';
import { followUpsQuery } from '@/data/queries';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { addDays, formatDate, todayInBuenosAires } from '@/domain/dates';
import { followUpInputSchema, type Client, type FollowUpInput } from '@/domain/schemas';

export function nextMonday(date: string): string {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  return addDays(date, (8 - weekday) % 7 || 7);
}

export function PersonalReviewSchedule({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  return <SectionCard title="Agendar mi revisión" description="Reservá tiempo para analizar esta cuenta y después compartir tu recomendación con el asesor.">
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}><CalendarDays/>{open ? 'Ocultar agenda de esta cuenta' : 'Elegir fecha y hora'}</Button>
    {open && <ScheduleForm client={client}/>}
  </SectionCard>;
}

function ScheduleForm({ client }: { client: Client }) {
  const { data: items = [], error: listError } = useQuery(followUpsQuery());
  const [title, setTitle] = useState(('Revisar cartera · ' + client.name).slice(0, 120));
  const [date, setDate] = useState(() => nextMonday(todayInBuenosAires()));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('Pendiente de mi revisión. Analizar posición, documentar qué recomiendo y por qué. Después preparar el aviso al asesor para su validación.');
  const [error, setError] = useState('');
  const save = useRepoMutation((repo, input: FollowUpInput) => repo.createFollowUp(input), {
    success: 'Revisión agendada en Agenda. Falta confirmar el evento en Calendar.', invalidate: ['follow-ups'],
  });
  const own = items.filter(item => item.clientId === client.id || item.link.kind === 'bloque' && item.link.clientIds.includes(client.id));
  const displayed = save.data && !own.some(item => item.id === save.data.id) ? [save.data, ...own] : own;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = followUpInputSchema.safeParse({ clientId: client.id, title, date, time, durationMinutes: duration, notes, link: { kind: 'bloque', clientIds: [client.id] } });
    if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join(' · ')); return; }
    setError('');
    save.mutate(parsed.data);
  };
  return <div className="mt-5 space-y-5">
    <GoogleConnection/>
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Qué voy a revisar" htmlFor="schedule-title"><Input id="schedule-title" maxLength={120} value={title} onChange={e => { setTitle(e.target.value); save.reset(); }} required/></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha" htmlFor="schedule-date"><Input id="schedule-date" type="date" value={date} onChange={e => { setDate(e.target.value); save.reset(); }} required/></Field>
        <Field label="Hora · Buenos Aires" htmlFor="schedule-time"><Input id="schedule-time" type="time" value={time} onChange={e => { setTime(e.target.value); save.reset(); }} required/></Field>
        <Field label="Duración en minutos" htmlFor="schedule-duration"><Input id="schedule-duration" type="number" min={15} max={480} value={duration} onChange={e => { setDuration(Number(e.target.value)); save.reset(); }} required/></Field>
      </div>
      <Button type="button" variant="ghost" className="justify-self-start" onClick={() => { setDate(nextMonday(todayInBuenosAires())); save.reset(); }}>El próximo lunes</Button>
      <Field label="Qué quiero recordar" htmlFor="schedule-notes"><Textarea id="schedule-notes" rows={3} maxLength={1000} value={notes} onChange={e => { setNotes(e.target.value); save.reset(); }}/></Field>
      <p className="text-xs text-muted-foreground">Es un bloque personal: no invita ni envía avisos al asesor. Primero guardás la tarea acá y después confirmás el evento en tu Calendar.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <Button disabled={save.isPending || save.isSuccess || !!listError} className="justify-self-start">{save.isPending ? 'Guardando…' : save.isSuccess ? 'Preparación guardada · confirmá Calendar debajo' : 'Guardar y preparar Calendar'}</Button>
    </form>
    {listError && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los eventos preparados. Recargá antes de crear otro.</p>}
    {displayed.length > 0 && <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">Revisiones y seguimientos de esta cuenta</h3>{[...displayed].sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)).map(item => <div key={item.id} className="rounded-lg border p-4">
      <p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.date)} · {item.time} · {item.durationMinutes} min · {item.calendarEventId ? 'Creado en Calendar' : 'Preparado en Agenda; falta Calendar'}</p>
      {item.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>}
      <CalendarAction item={item} description={`Agenda Amauta\n${client.id} · ${client.name}\n${item.notes || ''}\n${window.location.origin}/clientes/${encodeURIComponent(client.id)}`}/>
    </div>)}</div>}
  </div>;
}
