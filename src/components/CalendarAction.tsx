import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { recordCalendarReference } from '@/data/google-links';
import { createCalendarEvent, calendarConflicts, type CalendarInput } from '@/integrations/google/workspace';
import { useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
import type { FollowUp } from '@/domain/schemas';

export function CalendarAction({ item, description }: { item: FollowUp; description: string }) {
  const google = useGoogleWorkspace(), queryClient = useQueryClient();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<{ id: string; summary: string }[] | null>(null);
  const [url, setUrl] = useState(item.calendarUrl || '');
  const input: CalendarInput = { key: item.id, title: item.title, date: item.date, time: item.time, durationMinutes: item.durationMinutes, description };
  async function check() { setBusy(true); setError(''); try { setConflicts(await calendarConflicts(input)); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function create() {
    setBusy(true); setError('');
    try {
      if (item.googleAccount && item.googleAccount !== google.email) throw Error('Este evento pertenece a '+item.googleAccount+'. Conectá esa cuenta.');
      const result = await createCalendarEvent(input);
      setUrl(result.htmlLink);
      await recordCalendarReference(item.id, { id: result.id, account: google.email, url: result.htmlLink });
      await queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-3">
    {url ? <a className="text-sm underline" href={url} target="_blank" rel="noopener noreferrer">Abrir evento en Google Calendar</a> : <>
      <Button type="button" variant="outline" disabled={!google.connected || busy || !!item.calendarEventId} onClick={() => void check()}>{busy ? 'Consultando…' : item.calendarEventId ? 'Evento ya creado' : 'Revisar y agendar en Calendar'}</Button>
      {conflicts !== null && <div className="space-y-3 rounded border bg-muted/30 p-3 text-sm">
        <p><strong>{item.title}</strong> · {item.date} · {item.time} · {item.durationMinutes} minutos · Buenos Aires</p>
        <p>Calendario laboral de {google.email} · sin invitados · evento privado.</p>
        {conflicts.length ? <p role="status">Hay superposición con: {conflicts.map(c => c.summary).join(', ')}. Revisá el horario antes de confirmar.</p> : <p>No hay superposiciones en tu calendario principal para ese horario.</p>}
        <Button type="button" disabled={busy} onClick={() => void create()}>Confirmar y crear evento{conflicts.length ? ' con superposición' : ''}</Button>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
