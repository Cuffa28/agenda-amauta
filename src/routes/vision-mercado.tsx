import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader, SectionCard } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { marketViewQuery } from '@/data/queries';
import { useRepoMutation } from '@/data/use-repo-mutation';
import type { MarketViewVersionInput } from '@/domain/schemas';

export const Route=createFileRoute('/vision-mercado')({ssr:false,component:MarketPage});
function MarketPage(){
  const {data:view}=useSuspenseQuery(marketViewQuery());
  const [title,setTitle]=useState(''); const [summary,setSummary]=useState(''); const [body,setBody]=useState('');
  const save=useRepoMutation((repo,input:MarketViewVersionInput)=>repo.publishMarketViewVersion(input),{invalidate:['market-view'],success:'Versión guardada en Agenda'});
  return <><PageHeader title="Visión de mercado" description="Cada revisión conserva su versión; guardar una nueva no modifica las anteriores." />
    <SectionCard title="Nueva versión"><form className="grid gap-4" onSubmit={e=>{e.preventDefault();save.mutate({title,summary,body,author:'Amauta'});}}>
      <label>Título<Input value={title} onChange={e=>setTitle(e.target.value)} required minLength={3}/></label>
      <label>Resumen<Textarea value={summary} onChange={e=>setSummary(e.target.value)} required minLength={10}/></label>
      <label>Lectura de mercado<Textarea rows={6} value={body} onChange={e=>setBody(e.target.value)} required minLength={20}/></label>
      <Button disabled={save.isPending}>Guardar versión</Button></form></SectionCard>
    <div className="mt-6 grid gap-4">{view.versions.map(v=><SectionCard key={v.id} title={`v${v.version} · ${v.title}`} description={v.publishedAt}><p>{v.summary}</p><p className="mt-4 whitespace-pre-wrap text-muted-foreground">{v.body}</p></SectionCard>)}</div>
  </>;
}
