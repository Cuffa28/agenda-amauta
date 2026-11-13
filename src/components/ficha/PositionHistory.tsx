import {PdfAttachment} from './PdfAttachment';
import {useQuery} from '@tanstack/react-query';
import {getRepository} from '@/data';
import {SectionCard} from '@/components/PageHeader';
import {formatMoney,formatNumber} from '@/domain/format';
import type {Position} from '@/domain/schemas';
export function PositionHistory({position}:{position:Position}){
 const {data:history,error}=useQuery({queryKey:['position-history',position.clientId],queryFn:()=>getRepository().listPositionHistory(position.clientId)});
 const index=history?.findIndex(p=>p.id===position.id)??-1,previous=history?.[index+1];
 const all=new Map([...previous?.items||[],...position.items].map(it=>[(it.ticker||it.instrument)+'|'+it.currency,it]));
 return <SectionCard title="Historial y cambios de posición"><details><summary className="cursor-pointer">Ver posiciones anteriores y diferencias</summary>{error&&<p role="alert">No se pudo recuperar el historial.</p>}{history?.map(p=><div className="mt-3 space-y-2" key={p.id}><p className="text-sm">{p.cutoffDate} · {p.alyc}</p><PdfAttachment position={p}/></div>)}{previous?<><p className="mt-4 text-sm">Comparación con {previous.cutoffDate}. Un cambio de valuación no equivale a rendimiento: puede incluir cotización, movimientos y tipo de cambio.</p><div className="overflow-auto"><table className="mt-3 w-full text-left text-xs"><thead><tr><th>Instrumento</th><th>Cambio de cantidad</th><th>Cambio de valuación</th></tr></thead><tbody>{[...all.entries()].map(([key,item])=>{const old=previous.items.find(it=>(it.ticker||it.instrument)+'|'+it.currency===key),now=position.items.find(it=>(it.ticker||it.instrument)+'|'+it.currency===key);return <tr className="border-t" key={key}><td>{item.ticker||item.instrument} · {!old?'Nuevo':!now?'Ya no figura':'Existente'}</td><td>{formatNumber((now?.quantity||0)-(old?.quantity||0))}</td><td>{formatMoney((now?.marketValue||0)-(old?.marketValue||0),item.currency)}</td></tr>;})}</tbody></table></div></>:<p className="mt-3 text-sm">Todavía no hay una posición anterior para comparar.</p>}</details></SectionCard>;
}
