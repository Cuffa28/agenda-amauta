import { stableUuid } from '@/domain/ids';
import { requireAgendaSession } from './supabase/client';
import { rotationPlanSchema, type RotationPlan } from '@/domain/rotation';
export interface Workflow { id:string;plan:RotationPlan;updatedAt:string;history:{stage:string;note:string;at:string}[] }
export async function loadWorkflow(clientId:string,positionId:string):Promise<Workflow|null>{
  const {supabase}=await requireAgendaSession();
  const {data,error}=await supabase.from('agenda_drafts').select('*').eq('client_id',clientId).eq('source_snapshot->>kind','client_workflow');
  if(error)throw error;
  const row=data?.find(r=>r.source_snapshot?.positionId===positionId);
  return row?{id:row.id,plan:rotationPlanSchema.parse(row.source_snapshot.plan),history:row.source_snapshot.history||[],updatedAt:row.updated_at}:null;
}
export async function saveWorkflow(clientId:string,positionId:string,input:RotationPlan,old:Workflow|null):Promise<void>{
  const plan=rotationPlanSchema.parse(input),{supabase}=await requireAgendaSession();
  const {data:position,error:positionError}=await supabase.from('agenda_positions').select('id').eq('id',positionId).eq('client_id',clientId).single();
  if(positionError||!position)throw Error('La posición no pertenece a esta cartera.');
  if(plan.stage!=='en_analisis'&&plan.note.length<5)throw Error('Agregá una nota para documentar el avance.');
  const history=[...(old?.history||[])];
  if(!old||old.plan.stage!==plan.stage||old.plan.note!==plan.note)history.push({stage:plan.stage,note:plan.note,at:new Date().toISOString()});
  const payload={id:old?.id||await stableUuid('client-workflow:'+clientId+':'+positionId),client_id:clientId,subject:'Plan y seguimiento de cartera',body:plan.note,source_snapshot:{kind:'client_workflow',positionId,plan,history}};
  if(old){const {data,error}=await supabase.from('agenda_drafts').update(payload).eq('id',old.id).eq('updated_at',old.updatedAt).select('id').maybeSingle();if(error||!data)throw Error('El plan cambió en otra sesión. Recargá antes de guardar.');}
  else{const {error}=await supabase.from('agenda_drafts').insert(payload);if(error)throw error;}
}
