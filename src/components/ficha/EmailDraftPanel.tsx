import { useState } from 'react';
import { SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { GoogleConnection, useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
import { saveGmailDraft } from '@/integrations/google/workspace';
import { gmailReference, recordGmailReference } from '@/data/google-links';
import { draftFingerprint,generateEmailDraft,type DraftSource } from '@/domain/email-draft';
import type { EmailDraft,EmailDraftInput } from '@/domain/schemas';

export function EmailDraftPanel({source,saved}:{source:DraftSource;saved:EmailDraft|undefined}){
  const [subject,setSubject]=useState(saved?.subject??'');const [body,setBody]=useState(saved?.body??'');
  const [fingerprint,setFingerprint]=useState(saved?.sourceFingerprint??'');
  const [generatedAt,setGeneratedAt]=useState(saved?.generatedAt??'');
  const google=useGoogleWorkspace();const [gmailBusy,setGmailBusy]=useState(false),[gmailError,setGmailError]=useState(''),[gmailSaved,setGmailSaved]=useState(false);
  const current=draftFingerprint(source);const stale=!!fingerprint&&fingerprint!==current;
  const save=useRepoMutation((repo,input:EmailDraftInput)=>repo.saveEmailDraft(input),{success:'Borrador guardado en Agenda'});
  async function gmail(){setGmailBusy(true);setGmailError('');try{await save.mutateAsync({reviewId:source.review.id,subject,body,sourceFingerprint:fingerprint,editedManually:true,generatedAt});const ref=await gmailReference(source.review.id);if(ref&&ref.account!==google.email)throw Error('El borrador pertenece a otra cuenta de Google. Conectá '+ref.account);const localKey=`agenda.gmail.ref:${google.email}:${source.review.id}`;let draftId=ref?.id||localStorage.getItem(localKey)||undefined;if(draftId&&!window.confirm('Se actualizará el borrador existente en Gmail con este texto. Si lo editaste en Gmail, revisá esos cambios antes de continuar.'))return;const result=await saveGmailDraft({to:source.advisor.email,subject,body,...(draftId?{draftId}:{})});localStorage.setItem(localKey,result.id);await recordGmailReference(source.review.id,{id:result.id,account:google.email});setGmailSaved(true);}catch(e){setGmailError((e as Error).message);}finally{setGmailBusy(false);}}
  function generate(){if(body&&!window.confirm('Se reemplazará el texto editado por un nuevo borrador. ¿Continuar?'))return;const d=generateEmailDraft(source);setSubject(d.subject);setBody(d.body);setFingerprint(current);setGeneratedAt(new Date().toISOString());}
  return <SectionCard title="Borrador para el asesor" description={`Destinatario: ${source.advisor.name} · ${source.advisor.email}`}>
    <Button onClick={generate} variant="outline">{fingerprint?'Regenerar explícitamente':'Generar borrador'}</Button>
    {stale&&<p role="alert" className="mt-3 text-destructive">La ficha cambió. Revisá y regenerá el borrador antes de guardarlo.</p>}
    <label className="mt-4 block">Asunto<Input value={subject} onChange={e=>setSubject(e.target.value)}/></label>
    <label className="mt-4 block">Cuerpo editable<Textarea rows={15} value={body} onChange={e=>setBody(e.target.value)}/></label>
    <div className="mt-4"><GoogleConnection/></div><div className="mt-4 flex flex-wrap gap-3"><Button disabled={!fingerprint||stale||save.isPending} onClick={()=>save.mutate({reviewId:source.review.id,subject,body,sourceFingerprint:fingerprint,editedManually:true,generatedAt})}>Guardar</Button><Button disabled={!google.connected||!source.advisor.email||!fingerprint||stale||gmailBusy||save.isPending} variant="outline" onClick={()=>void gmail()}>{gmailBusy?"Guardando…":"Guardar borrador en Gmail"}</Button></div>
    {gmailError&&<p role="alert" className="mt-3 text-sm text-destructive">{gmailError}</p>}{gmailSaved&&<p role="status" className="mt-3 text-sm">Guardado en Gmail. <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(google.email)}#drafts`}>Abrir borradores</a> · Vos revisás y enviás el mensaje.</p>}
    <details className="mt-4"><summary>Vista previa</summary><strong>{subject}</strong><p className="whitespace-pre-wrap">{body}</p></details>
  </SectionCard>;
}
