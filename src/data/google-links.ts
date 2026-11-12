import { requireAgendaSession } from './supabase/client';
export interface ExternalRef { id: string; account: string; url?: string }
export async function gmailReference(reviewId: string): Promise<ExternalRef | null> {
  const { supabase } = await requireAgendaSession();
  const { data, error } = await supabase.from('agenda_drafts').select('id,gmail_draft_id,source_snapshot').eq('source_snapshot->>kind', 'email_draft');
  if (error) throw error;
  const row = data?.find(row => row.source_snapshot?.input?.reviewId === reviewId);
  return row?.gmail_draft_id ? { id: row.gmail_draft_id, account: row.source_snapshot?.google?.account || '' } : null;
}
export async function recordGmailReference(reviewId: string, ref: ExternalRef) {
  const { supabase } = await requireAgendaSession();
  const { data, error } = await supabase.from('agenda_drafts').select('*').eq('source_snapshot->>kind', 'email_draft');
  if (error) throw error;
  const row = data?.find(row => row.source_snapshot?.input?.reviewId === reviewId);
  if (!row) throw Error('Guardá primero el borrador en Agenda.');
  const { data: updated, error: saveError } = await supabase.from('agenda_drafts').update({ gmail_draft_id: ref.id, source_snapshot: { ...row.source_snapshot, google: ref } }).eq('id', row.id).eq('updated_at', row.updated_at).select('id').maybeSingle();
  if (saveError || !updated) throw Error('El borrador está en Gmail, pero no se pudo guardar su referencia en Agenda. Recargá antes de continuar.');
}
export async function recordCalendarReference(taskId: string, ref: ExternalRef) {
  const { supabase } = await requireAgendaSession();
  const { data: row, error } = await supabase.from('agenda_tasks').select('*').eq('id', taskId).single();
  if (error) throw error;
  const meta = JSON.parse(row.notes || '{}');
  if (meta.kind !== 'followup') throw Error('El registro no es un seguimiento o bloque de revisión.');
  const { data: updated, error: saveError } = await supabase.from('agenda_tasks').update({ calendar_event_id: ref.id, notes: JSON.stringify({ ...meta, google: ref }) }).eq('id', taskId).eq('updated_at', row.updated_at).select('id').maybeSingle();
  if (saveError || !updated) throw Error('El evento está en Calendar, pero no se pudo guardar su referencia en Agenda. Un reintento conservará el mismo evento.');
}
