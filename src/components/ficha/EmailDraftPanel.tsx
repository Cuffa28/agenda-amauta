import { useState } from 'react';
import { toast } from 'sonner';
import { SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { GoogleConnection, useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
import { saveGmailDraft } from '@/integrations/google/workspace';
import { gmailReference, recordGmailReference } from '@/data/google-links';
import { draftFingerprint, generateEmailDraft, draftForChat, type DraftSource } from '@/domain/email-draft';
import type { EmailDraft, EmailDraftInput } from '@/domain/schemas';

export function EmailDraftPanel({ source, saved }: { source: DraftSource; saved: EmailDraft | undefined }) {
  const [editor, setEditor] = useState(() => {
    const initial = generateEmailDraft(source);
    return { subject: saved?.subject ?? initial.subject, body: saved?.body ?? initial.body,
      fingerprint: saved?.sourceFingerprint ?? draftFingerprint(source), generatedAt: saved?.generatedAt ?? new Date().toISOString() };
  });
  const { subject, body, fingerprint, generatedAt } = editor;
  const google = useGoogleWorkspace();
  const [gmailBusy, setGmailBusy] = useState(false), [gmailError, setGmailError] = useState(''), [gmailSaved, setGmailSaved] = useState(false);
  const current = draftFingerprint(source), stale = fingerprint !== current;
  const valid = !!source.advisor.email && subject.trim().length >= 3 && body.trim().length >= 10 && !stale;
  const save = useRepoMutation((repo, input: EmailDraftInput) => repo.saveEmailDraft(input), { invalidate: ['drafts'], success: 'Borrador guardado en Agenda' });
  const input = (): EmailDraftInput => ({ reviewId: source.review.id, subject, body, sourceFingerprint: fingerprint, editedManually: true, generatedAt });

  async function gmail() {
    setGmailBusy(true); setGmailError(''); setGmailSaved(false);
    try {
      await save.mutateAsync(input());
      const ref = await gmailReference(source.review.id);
      if (ref && ref.account !== google.email) throw Error('El borrador pertenece a otra cuenta de Google. Conectá ' + ref.account);
      const localKey = `agenda.gmail.ref:${google.email}:${source.review.id}`;
      const draftId = ref?.id || localStorage.getItem(localKey) || undefined;
      if (draftId && !window.confirm('Se actualizará el borrador existente en Gmail con este texto. Revisá primero cualquier cambio que hayas hecho en Gmail.')) return;
      const result = await saveGmailDraft({ to: source.advisor.email, subject, body, ...(draftId ? { draftId } : {}) });
      localStorage.setItem(localKey, result.id);
      await recordGmailReference(source.review.id, { id: result.id, account: google.email });
      setGmailSaved(true);
    } catch (e) { setGmailError((e as Error).message); }
    finally { setGmailBusy(false); }
  }
  function regenerate() {
    if (!window.confirm('¿Reemplazar este texto por un borrador basado en la decisión guardada?')) return;
    setEditor({ ...generateEmailDraft(source), fingerprint: current, generatedAt: new Date().toISOString() });
    setGmailSaved(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draftForChat(source, { subject, body }));
      toast.success('Copiado: pegalo en este chat para revisar el correo o pedir el envío');
    } catch { toast.error('No se pudo copiar. Podés seleccionar el destinatario, asunto y cuerpo manualmente.'); }
  }
  return <SectionCard title="Borrador para el asesor" description="Preparado con los datos guardados. Revisá el texto antes de compartirlo.">
    <label className="block text-sm">Para · {source.advisor.name}<Input aria-label="Destinatario del borrador" readOnly value={source.advisor.email} placeholder="Asigná el correo en Editar ficha" /></label>
    {!source.advisor.email && <p role="alert" className="mt-2 text-sm">Falta el correo del asesor. Completalo desde Editar ficha.</p>}
    {stale && <p role="alert" className="mt-3 text-destructive">Cambió la decisión, la posición o el asesor. Actualizá el borrador para usar los datos guardados actuales.</p>}
    <Button onClick={regenerate} variant="outline" className="mt-3">Actualizar con la decisión guardada</Button>
    <label className="mt-4 block">Asunto<Input value={subject} maxLength={200} onChange={e => { setEditor(s => ({ ...s, subject: e.target.value })); setGmailSaved(false); }} /></label>
    <label className="mt-4 block">Cuerpo editable<Textarea rows={10} maxLength={10000} value={body} onChange={e => { setEditor(s => ({ ...s, body: e.target.value })); setGmailSaved(false); }} /></label>
    <div className="mt-4 flex flex-wrap gap-3">
      <Button disabled={!valid || save.isPending || gmailBusy} onClick={() => save.mutate(input())}>{save.isPending ? 'Guardando…' : 'Guardar en Agenda'}</Button>
      <Button disabled={!valid} variant="outline" onClick={() => void copy()}>Copiar para este chat</Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Al copiar se incluyen destinatario, asunto y cuerpo. Pegalos acá y pedime revisar o enviar ese correo; copiar no lo envía.</p>
    <details className="mt-4"><summary className="cursor-pointer">Guardar también en Gmail</summary><div className="mt-3"><GoogleConnection /></div>
      <Button className="mt-3" disabled={!google.connected || !valid || gmailBusy || save.isPending} variant="outline" onClick={() => void gmail()}>{gmailBusy ? 'Guardando…' : 'Guardar borrador en Gmail'}</Button>
    </details>
    {gmailError && <p role="alert" className="mt-3 text-sm text-destructive">{gmailError}</p>}
    {gmailSaved && <p role="status" className="mt-3 text-sm">Guardado en Gmail. <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(google.email)}#drafts`}>Abrir borradores</a></p>}
    <details className="mt-4"><summary>Vista previa</summary><p className="mt-2">Para: {source.advisor.email}</p><strong>{subject}</strong><p className="whitespace-pre-wrap">{body}</p></details>
  </SectionCard>;
}
