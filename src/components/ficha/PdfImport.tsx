import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extractPdfText } from '@/domain/import/pdf';
import { parseBalanz } from '@/domain/import/balanz';
export function PdfImport({driveUrl,onImport}:{driveUrl:string;onImport:(value:ReturnType<typeof parseBalanz>)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(file?:File) {setBusy(true);setError('');try{let blob:Blob;
    if(file)blob=file;else {const id=driveUrl.match(/\/file\/d\/([\w-]+)/)?.[1];if(!id)throw Error('Elegí o subí el PDF en Drive primero.');
      // El contenido se procesa en el navegador; no se transmite a un extractor externo.
      const {downloadDrivePdf}=await import('@/integrations/google/workspace');blob=await downloadDrivePdf(id);}
    const parsed=parseBalanz(await extractPdfText(blob));onImport(parsed);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="space-y-2 rounded border p-3"><p className="text-sm font-medium">Importar detalle del PDF · Balanz</p><div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={busy||!driveUrl} onClick={()=>void run()}>Extraer PDF seleccionado en Drive</Button><label className="text-sm">O analizar un PDF local<Input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void run(file);e.target.value='';}}/></label></div><p className="text-xs text-muted-foreground">La extracción completa los campos para que los revises. No guarda la posición ni la da por conciliada.</p>{busy&&<p role="status">Leyendo PDF…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
