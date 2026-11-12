import { PdfImport } from './PdfImport';
import { useState } from 'react';
import { SectionCard } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { pickDrivePdf, uploadDrivePdf } from '@/integrations/google/workspace';
import { GoogleConnection, useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
import { positionSchema, type Currency, type Position } from '@/domain/schemas';

export function PositionEditor({clientId}:{clientId:string}) {
  const [broker,setBroker]=useState(''),[cutoff,setCutoff]=useState(''),[url,setUrl]=useState(''),[detail,setDetail]=useState(''),[ars,setArs]=useState(''),[usd,setUsd]=useState(''),[error,setError]=useState('');
  const google=useGoogleWorkspace(); const [driveBusy,setDriveBusy]=useState(false);
  const [pdfName,setPdfName]=useState(''),[sourceNote,setSourceNote]=useState('');
  async function selectPdf(file?:File){setDriveBusy(true);setError('');try{const pdf=file?await uploadDrivePdf(file):await pickDrivePdf();if(pdf){setUrl(pdf.webViewLink || `https://drive.google.com/file/d/${pdf.id}/view`);setPdfName(pdf.name);}}catch(e){setError((e as Error).message);}finally{setDriveBusy(false);}}
  const save=useRepoMutation((repo,p:Position)=>repo.savePosition(p),{success:'Nueva posición guardada; el historial anterior se conserva'});
  function submit(e:React.FormEvent){
    e.preventDefault();setError('');
    try {
      const match=url.trim().match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{10,200})(?:[/?#]|$)/);
      if(url.trim()&&!match)throw Error('Usá el enlace del PDF en Drive laboral.');
      const items=detail.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{
        const [instrument,ticker,currency,quantity,price,value,...extra]=line.split(';').map(v=>v.trim());
        if(extra.length||![quantity,price,value].every(v=>v&&/^-?\d+(\.\d+)?$/.test(v)))throw Error('Revisá la línea '+(i+1)+': seis columnas e importes con punto decimal.');
        return {id:crypto.randomUUID(),instrument:instrument!,ticker:ticker||undefined,currency:currency as Currency,quantity:Number(quantity),price:Number(price),marketValue:Number(value)};
      });
      const declaredTotals: {currency:Currency;amount:number}[]=[];if(ars!=='')declaredTotals.push({currency:'ARS',amount:Number(ars)});if(usd!=='')declaredTotals.push({currency:'USD',amount:Number(usd)});
      const parsed=positionSchema.parse({id:crypto.randomUUID(),clientId,alyc:broker,cutoffDate:cutoff,drivePdf:match?{fileId:match[1],fileName:pdfName || 'PDF de posición al '+cutoff}:null,items,declaredTotals,sourceNote:sourceNote||undefined});save.mutate(parsed);
    }catch(e){setError((e as Error).message);}
  }
  return <SectionCard title="Cargar una nueva posición"><details><summary className="cursor-pointer text-sm">Vincular PDF y cargar detalle</summary><form className="mt-4 grid gap-4" onSubmit={submit}>
    <div className="grid gap-4 sm:grid-cols-2"><label>ALyC<Input value={broker} onChange={e=>setBroker(e.target.value)} required/></label><label>Fecha de corte<Input type="date" value={cutoff} onChange={e=>setCutoff(e.target.value)} required/></label></div>
    <GoogleConnection/>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={!google.connected||driveBusy} onClick={()=>void selectPdf()}>Elegir PDF de Drive</Button><label className="text-sm">Subir PDF al Drive laboral<Input type="file" accept="application/pdf,.pdf" disabled={!google.connected||driveBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void selectPdf(file);e.target.value='';}}/></label></div>
    {driveBusy&&<p role="status">Preparando PDF…</p>}
    <label>PDF original en Drive laboral<Input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…"/></label>
    <PdfImport driveUrl={url} onImport={p=>{setBroker(p.alyc);setCutoff(p.cutoffDate);setDetail(p.items.map(it=>[it.instrument,it.ticker||'',it.currency,it.quantity,it.price,it.marketValue].join(';')).join('\n'));setArs(String(p.declaredTotals[0]!.amount));setUsd('');setSourceNote(p.sourceNote);}}/>
    {sourceNote&&<p className="rounded border p-3 text-sm">{sourceNote}</p>}
    <p className="text-xs text-muted-foreground">Carga manual o detalle ya extraído. Una línea por instrumento: nombre;ticker;ARS o USD;cantidad;precio;valor. Usá punto decimal sin separador de miles. La extracción automática disponible arriba reconoce resúmenes Balanz con texto.</p>
    <label>Detalle de la posición<Textarea rows={6} value={detail} onChange={e=>setDetail(e.target.value)} required/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label>Total ARS declarado en el PDF<Input type="number" step="0.01" value={ars} onChange={e=>setArs(e.target.value)}/></label><label>Total USD declarado en el PDF<Input type="number" step="0.01" value={usd} onChange={e=>setUsd(e.target.value)}/></label></div>
    <p className="text-xs text-muted-foreground">Los totales deben usar la misma base de valuación que el detalle. No se convierten monedas automáticamente ni se da por conciliada una posición por el solo hecho de guardarla.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" required/>Confirmo que el PDF y el detalle corresponden al cliente de esta ficha y a la fecha indicada.</label>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={save.isPending}>Guardar nueva posición</Button>
  </form></details></SectionCard>;
}
