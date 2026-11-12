import { useState } from 'react';
import { SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { draftFingerprint,generateEmailDraft,type DraftSource } from '@/domain/email-draft';
import type { EmailDraft,EmailDraftInput } from '@/domain/schemas';

export function EmailDraftPanel({source,saved}:{source:DraftSource;saved:EmailDraft|undefined}){
  const [subject,setSubject]=useState(saved?.subject??'');const [body,setBody]=useState(saved?.body??'');
  const [fingerprint,setFingerprint]=useState(saved?.sourceFingerprint??'');
  const [generatedAt,setGeneratedAt]=useState(saved?.generatedAt??'');
  const current=draftFingerprint(source);const stale=!!fingerprint&&fingerprint!==current;
  const save=useRepoMutation((repo,input:EmailDraftInput)=>repo.saveEmailDraft(input),{success:'Borrador guardado en Agenda'});
  function generate(){if(body&&!window.confirm('Se reemplazará el texto editado por un nuevo borrador. ¿Continuar?'))return;const d=generateEmailDraft(source);setSubject(d.subject);setBody(d.body);setFingerprint(current);setGeneratedAt(new Date().toISOString());}
  return <SectionCard title="Borrador para el asesor" description={`Destinatario: ${source.advisor.name} · ${source.advisor.email}`}>
    <Button onClick={generate} variant="outline">{fingerprint?'Regenerar explícitamente':'Generar borrador'}</Button>
    {stale&&<p role="alert" className="mt-3 text-destructive">La ficha cambió. Revisá y regenerá el borrador antes de guardarlo.</p>}
    <label className="mt-4 block">Asunto<Input value={subject} onChange={e=>setSubject(e.target.value)}/></label>
    <label className="mt-4 block">Cuerpo editable<Textarea rows={15} value={body} onChange={e=>setBody(e.target.value)}/></label>
    <div className="mt-4 flex gap-3"><Button disabled={!fingerprint||stale||save.isPending} onClick={()=>save.mutate({reviewId:source.review.id,subject,body,sourceFingerprint:fingerprint,editedManually:true,generatedAt})}>Guardar</Button><Button disabled variant="outline">Guardar en Gmail · no conectado</Button></div>
    <details className="mt-4"><summary>Vista previa</summary><strong>{subject}</strong><p className="whitespace-pre-wrap">{body}</p></details>
  </SectionCard>;
}
