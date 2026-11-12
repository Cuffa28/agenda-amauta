import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '@/data/supabase/repository';
import { mapClient, mapPosition } from '@/data/supabase/mappers';
import { portfolioMonthStatus } from '@/domain/coverage';

function database() {
  let sequence = 0;
  const tables: Record<string, any[]> = {
    agenda_clients: Array.from({length:107},(_,i)=>({id:`000${i}-00`,name:`Cliente de prueba ${i}`,segment:'Medio',active:true,review_day:null,updated_at:'2026-11-12T10:00:00Z'})),
    agenda_positions: [], agenda_drafts: [], agenda_tasks: [], agenda_reviews: [],
    agenda_market_versions: [{id:'market-one',title:'Visión inicial',body:JSON.stringify({schema:'agenda-market-v1',summary:'Resumen suficientemente largo',body:'Lectura inicial para probar la conservación de versiones.'}),as_of:'2026-11-12',created_at:'2026-11-12T10:00:00Z'}],
  };
  class Query {
    filters: [string,unknown][]=[]; action='select'; payload:any; one=false;
    constructor(readonly table:string) {}
    select(){return this;} eq(k:string,v:unknown){this.filters.push([k,v]);return this;}
    insert(p:any){this.action='insert';this.payload=p;return this;} update(p:any){this.action='update';this.payload=p;return this;}
    single(){this.one=true;return this.execute();} maybeSingle(){this.one=true;return this.execute();}
    then(ok:any,fail:any){return this.execute().then(ok,fail);}
    async execute(){
      if (!this.table.startsWith('agenda_')) throw Error('Acceso ajeno a Agenda');
      let selected=tables[this.table]!.filter(r=>this.filters.every(([k,v])=>r[k]===v));
      if(this.action==='insert'){
        const at=new Date(Date.UTC(2026,10,12,12,0,++sequence)).toISOString();
        const r={id:crypto.randomUUID(),created_at:at,updated_at:at,completed_at:null,status:'open',...structuredClone(this.payload)};
        if(this.table==='agenda_reviews')r.market_snapshot=structuredClone(tables['agenda_market_versions']!.find(v=>v.id===r.market_version_id));
        tables[this.table]!.push(r);selected=[r];
      }
      if(this.action==='update')selected.forEach(r=>Object.assign(r,structuredClone(this.payload),{updated_at:new Date(Date.UTC(2026,10,12,13,0,++sequence)).toISOString()}));
      return {data:structuredClone(this.one?(selected[0]??null):selected),error:null};
    }
  }
  return { tables, client:{from:(name:string)=>new Query(name)} as unknown as SupabaseClient };
}

describe('Adaptador de datos reales',()=>{
  it('preserva IDs y no inventa un día de revisión ni un PDF',()=>{
    const client=mapClient({id:'00123-00',name:'Cliente',segment:'Alto',review_day:null});
    expect(client.id).toBe('00123-00');expect(client.reviewDay).toBe(0);
    expect(portfolioMonthStatus(client,'2026-11',[],[],'2026-11-12').status).toBe('sin_programar');
    const position=mapPosition({id:'p',client_id:'00123-00',broker:'Balanz',as_of:'2026-11-12',drive_url:null,details:[],totals:{}});
    expect(position.drivePdf).toBeNull();
  });
  it('conserva la revisión en curso después de reconstruir el repositorio',async()=>{
    const d=database(),repo=createSupabaseRepository(()=>d.client);
    const review=await repo.startReview({clientId:'0000-00',month:'2026-11'});
    await repo.saveDecision(review.id,{type:'mantener',nota:'Nota de prueba persistida'});
    const reopened=createSupabaseRepository(()=>d.client);
    expect(await reopened.listClients()).toHaveLength(107);
    expect((await reopened.listReviews())[0]?.decision).toEqual({type:'mantener',nota:'Nota de prueba persistida'});
  });
  it('cierra una revisión conservando el pendiente y la visión congelada',async()=>{
    const d=database(),repo=createSupabaseRepository(()=>d.client);
    const review=await repo.startReview({clientId:'0000-00',month:'2026-11'});
    await repo.saveDecision(review.id,{type:'mantener',nota:'Conservar hasta revisar nueva evidencia'});
    await repo.createPending({clientId:review.clientId,reviewId:review.id,origin:'manual',description:'Confirmar restricción del cliente',dueDate:'2026-11-20'});
    d.tables['agenda_market_versions']!.push({id:'market-two',title:'Visión siguiente',body:'Otra visión no debe alterar la utilizada.',as_of:'2026-11-13',created_at:'2026-11-13T10:00:00Z'});
    const closed=await repo.closeReview(review.id);
    expect(closed.marketViewSnapshot?.body).toBe(review.marketViewSnapshot?.body);
    const state=portfolioMonthStatus({id:review.clientId,reviewDay:12},'2026-11',await repo.listReviews(),await repo.listPendings(),'2026-11-12');
    expect(state.countsAsReviewed).toBe(true);expect(state.status).toBe('revisada_con_pendiente');
    expect((await repo.listPendings())[0]?.dueDate).toBe('2026-11-20');
  });
  it('no duplica la tarea de falta de información al reintentar cerrar',async()=>{
    const d=database(),repo=createSupabaseRepository(()=>d.client);
    const r=await repo.startReview({clientId:'0000-00',month:'2026-11'});
    await repo.saveDecision(r.id,{type:'falta_informacion',informacionFaltante:'Confirmar horizonte con asesor',fechaLimite:'2026-11-20'});
    await repo.closeReview(r.id);await repo.closeReview(r.id);
    expect(await repo.listPendings()).toHaveLength(1);expect(d.tables['agenda_reviews']).toHaveLength(1);
  });
  it('permite mantener con una nota aunque no haya visión de mercado publicada',async()=>{
    const d=database();d.tables['agenda_market_versions']=[];const repo=createSupabaseRepository(()=>d.client);
    const review=await repo.startReview({clientId:'0000-00',month:'2026-11'});
    expect(review.marketViewSnapshot).toBeNull();await repo.saveDecision(review.id,{type:'mantener',nota:'Se mantiene según la revisión realizada'});
    const closed=await repo.closeReview(review.id);expect(closed.marketViewSnapshot).toBeNull();expect(closed.status).toBe('cerrada');
  });
  it('guarda un bloque de carteras y no lo cuenta como pendiente de una revisión',async()=>{
    const d=database(),repo=createSupabaseRepository(()=>d.client);
    const input={clientId:'0000-00',title:'Revisar grupo de carteras',link:{kind:'bloque' as const,clientIds:['0000-00','0001-00']},date:'2026-11-16',time:'10:00',durationMinutes:60};
    await repo.createFollowUp(input);expect(await repo.listFollowUps()).toHaveLength(1);expect(await repo.listPendings()).toHaveLength(0);
    await expect(repo.createFollowUp({...input,link:{kind:'bloque',clientIds:['not-a-client']}})).rejects.toThrow();
  });

});
