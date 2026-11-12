import { useState } from 'react';
import { SectionCard } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useRepoMutation } from '@/data/use-repo-mutation';
import { positionSchema, type Currency, type Position } from '@/domain/schemas';

export function PositionEditor({clientId}:{clientId:string}) {
  const [broker,setBroker]=useState(''),[cutoff,setCutoff]=useState(''),[url,setUrl]=useState(''),[detail,setDetail]=useState(''),[ars,setArs]=useState(''),[usd,setUsd]=useState(''),[error,setError]=useState('');
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
      const parsed=positionSchema.parse({id:crypto.randomUUID(),clientId,alyc:broker,cutoffDate:cutoff,drivePdf:match?{fileId:match[1],fileName:'PDF de posición al '+cutoff}:null,items,declaredTotals});save.mutate(parsed);
    }catch(e){setError((e as Error).message);}
  }
  return <SectionCard title="Cargar una nueva posición"><details><summary className="cursor-pointer text-sm">Vincular PDF y cargar detalle</summary><form className="mt-4 grid gap-4" onSubmit={submit}>
    <div className="grid gap-4 sm:grid-cols-2"><label>ALyC<Input value={broker} onChange={e=>setBroker(e.target.value)} required/></label><label>Fecha de corte<Input type="date" value={cutoff} onChange={e=>setCutoff(e.target.value)} required/></label></div>
    <label>PDF original en Drive laboral<Input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…"/></label>
    <p className="text-xs text-muted-foreground">Carga manual o detalle ya extraído. Una línea por instrumento: nombre;ticker;ARS o USD;cantidad;precio;valor. Usá punto decimal sin separador de miles. No se extrae el PDF automáticamente.</p>
    <label>Detalle de la posición<Textarea rows={6} value={detail} onChange={e=>setDetail(e.target.value)} required/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label>Total ARS declarado en el PDF<Input type="number" step="0.01" value={ars} onChange={e=>setArs(e.target.value)}/></label><label>Total USD declarado en el PDF<Input type="number" step="0.01" value={usd} onChange={e=>setUsd(e.target.value)}/></label></div>
    <p className="text-xs text-muted-foreground">Los totales deben usar la misma base de valuación que el detalle. No se convierten monedas automáticamente ni se da por conciliada una posición por el solo hecho de guardarla.</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={save.isPending}>Guardar nueva posición</Button>
  </form></details></SectionCard>;
}
