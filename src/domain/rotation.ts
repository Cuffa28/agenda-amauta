import { z } from 'zod';
import type { Position } from './schemas';
export const workflowStages=['en_analisis','esperando_asesor','aceptada','ejecutada','seguimiento'] as const;
export const rotationPlanSchema=z.object({
  sales:z.record(z.number().finite().min(0).max(100)),
  cash:z.object({ARS:z.number().finite().nonnegative(),USD:z.number().finite().nonnegative()}),
  buys:z.array(z.object({name:z.string().trim().min(1).max(160),currency:z.enum(['ARS','USD']),amount:z.number().finite().nonnegative()})).max(50),
  stage:z.enum(workflowStages), note:z.string().trim().max(2000),
}).strict();
export type RotationPlan=z.infer<typeof rotationPlanSchema>;
export const emptyPlan=():RotationPlan=>({sales:{},cash:{ARS:0,USD:0},buys:[],stage:'en_analisis',note:''});
export function rotationTotals(position:Position,plan:RotationPlan){
  const p=rotationPlanSchema.parse(plan);
  const totals={ARS:{released:0,cash:p.cash.ARS,buys:0,remaining:0},USD:{released:0,cash:p.cash.USD,buys:0,remaining:0}};
  for(const [id,percent] of Object.entries(p.sales)){const item=position.items.find(it=>it.id===id);if(!item)throw Error('La posición cambió; revisá las salidas guardadas.');if(!item.ticker&&percent>0)throw Error('El efectivo se carga como saldo disponible, no como una venta.');totals[item.currency].released+=item.marketValue*percent/100;}
  for(const buy of p.buys)totals[buy.currency].buys+=buy.amount;
  for(const c of ['ARS','USD'] as const)totals[c].remaining=totals[c].cash+totals[c].released-totals[c].buys;
  return totals;
}
