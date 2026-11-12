import { useEffect,useRef,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/domain/format';
import { emptyPlan,rotationTotals,workflowStages,type RotationPlan } from '@/domain/rotation';
import { loadWorkflow,saveWorkflow,type Workflow } from '@/data/workflow';
import type { Position } from '@/domain/schemas';
const labels={en_analisis:'En análisis',esperando_asesor:'Esperando al asesor',aceptada:'Aceptada',ejecutada:'Ejecutada',seguimiento:'En seguimiento'};
export function RotationPanel({position}:{position:Position}){
  const key=['workflow',position.clientId,position.id],queryClient=useQueryClient();
  const {data:saved,isPending,error}=useQuery({queryKey:key,queryFn:()=>loadWorkflow(position.clientId,position.id)});
  const [plan,setPlanState]=useState<RotationPlan>(emptyPlan),[dirty,setDirty]=useState(false),[confirmed,setConfirmed]=useState(false);
  const base=useRef<Workflow|null>(null);
  const setPlan=(value:RotationPlan)=>{setDirty(true);setPlanState(value);};
  useEffect(()=>{if(saved!==undefined&&!dirty){base.current=saved||null;setPlanState(saved?.plan||emptyPlan());}},[saved,dirty]);
  const save=useMutation({mutationFn:async()=>{rotationTotals(position,plan);if(plan.stage==='ejecutada'&&!confirmed)throw Error('Confirmá que estás registrando una ejecución ya realizada.');await saveWorkflow(position.clientId,position.id,plan,base.current);},onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:key});setDirty(false);}});
  let totals:ReturnType<typeof rotationTotals>|null=null;let validation='';try{totals=rotationTotals(position,plan);}catch(e){validation=(e as Error).message;}
  if(isPending)return <SectionCard title="Propuesta y seguimiento"><p>Cargando plan guardado…</p></SectionCard>;
  if(error)return <SectionCard title="Propuesta y seguimiento"><p role="alert">No se pudo recuperar el plan. No se habilitó una versión vacía para evitar sobrescribirlo.</p></SectionCard>;
  return <SectionCard title="Simular cambios y documentar el avance" description={`Estimación con la posición al ${position.cutoffDate}; importes antes de costos y cambios de cotización. No ejecuta operaciones.`}>
    <details><summary className="cursor-pointer">Elegir salidas y evaluar incorporaciones</summary><div className="mt-3 space-y-4">
      <div className="max-h-64 overflow-auto">{position.items.filter(it=>!!it.ticker).map(it=><label key={it.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 border-b py-2 text-sm"><span>{it.ticker} · {formatMoney(it.marketValue,it.currency)}</span><span className="flex items-center gap-1"><Input type="number" aria-label={`Porcentaje a vender de ${it.ticker}`} min={0} max={100} value={plan.sales[it.id]||0} onChange={e=>setPlan({...plan,sales:{...plan.sales,[it.id]:Number(e.target.value)}})}/>%</span></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{(['ARS','USD'] as const).map(c=><label key={c}>Efectivo ya disponible · {c}<Input type="number" min={0} step="0.01" value={plan.cash[c]} onChange={e=>setPlan({...plan,cash:{...plan.cash,[c]:Number(e.target.value)}})}/></label>)}</div>
      <p className="text-xs text-muted-foreground">Ingresá el efectivo una sola vez. Los importes usan moneda de valuación; no presuponen la moneda de liquidación ni convierten ARS a USD.</p>
      {plan.buys.map((buy,index)=><div className="grid grid-cols-[1fr_5rem_8rem_auto] gap-2" key={index}><Input aria-label="Incorporación" value={buy.name} onChange={e=>setPlan({...plan,buys:plan.buys.map((x,i)=>i===index?{...x,name:e.target.value}:x)})}/><select aria-label="Moneda" value={buy.currency} onChange={e=>setPlan({...plan,buys:plan.buys.map((x,i)=>i===index?{...x,currency:e.target.value as 'ARS'|'USD'}:x)})}><option>ARS</option><option>USD</option></select><Input aria-label="Monto propuesto" type="number" min={0} value={buy.amount} onChange={e=>setPlan({...plan,buys:plan.buys.map((x,i)=>i===index?{...x,amount:Number(e.target.value)}:x)})}/><Button type="button" variant="ghost" onClick={()=>setPlan({...plan,buys:plan.buys.filter((_,i)=>i!==index)})}>Quitar</Button></div>)}
      <Button type="button" variant="outline" onClick={()=>setPlan({...plan,buys:[...plan.buys,{name:'Nueva incorporación',currency:'ARS',amount:0}]})}>Agregar incorporación</Button>
      {totals&&<div className="grid gap-3 sm:grid-cols-2">{(['ARS','USD'] as const).map(c=><div key={c} className="rounded border p-3 text-sm"><strong>{c}</strong><p>Ventas estimadas: {formatMoney(totals![c].released,c)}</p><p>Efectivo previo: {formatMoney(totals![c].cash,c)}</p><p>Incorporaciones: {formatMoney(totals![c].buys,c)}</p><p className={totals![c].remaining<0?'font-semibold text-destructive':'font-semibold'}>Saldo proyectado: {formatMoney(totals![c].remaining,c)}</p>{totals![c].remaining<0&&<p>La propuesta supera el saldo estimado en esta moneda.</p>}</div>)}</div>}
    </div></details>
    <div className="mt-5 grid gap-3"><label>Estado de la propuesta<select className="mt-1 block w-full rounded border p-2" value={plan.stage} onChange={e=>{setConfirmed(false);setPlan({...plan,stage:e.target.value as RotationPlan['stage']});}}>{workflowStages.map(stage=><option key={stage} value={stage}>{labels[stage]}</option>)}</select></label><label>Nota del avance<Textarea value={plan.note} onChange={e=>setPlan({...plan,note:e.target.value})}/></label>
    {plan.stage==='ejecutada'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que registro una ejecución ya realizada y verificada fuera de Agenda.</label>}
    {validation&&<p role="alert">{validation}</p>}{save.error&&<p role="alert">{save.error.message}</p>}<Button type="button" disabled={save.isPending||!!validation} onClick={()=>save.mutate()}>Guardar plan y avance</Button>{save.isSuccess&&<p role="status">Plan y avance guardados.</p>}
    {!!saved?.history.length&&<details><summary>Historial de avances</summary>{saved.history.map((h,i)=><p key={i} className="mt-2 text-xs">{new Date(h.at).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})} · {labels[h.stage as keyof typeof labels]||h.stage} · {h.note}</p>)}</details>}</div>
  </SectionCard>;
}
