export async function extractPdfText(blob: Blob):Promise<string> {
  const pdfjs=await import('pdfjs-dist');
  const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())});
  const document=await task.promise;
  try {
    if(document.numPages>100)throw Error('El PDF supera las 100 páginas. Usá un resumen de posiciones.');
    const pages:string[]=[];
    for(let n=1;n<=document.numPages;n++) {
      const page=await document.getPage(n),content=await page.getTextContent();
      const lines:{y:number;items:{x:number;str:string}[]}[]=[];
      for(const item of content.items) {if(!('str' in item))continue;const y=item.transform[5],x=item.transform[4];let line=lines.find(line=>Math.abs(line.y-y)<2.5);if(!line){line={y,items:[]};lines.push(line);}line.items.push({x,str:item.str});}
      pages.push(lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(it=>it.str).join(' ').replace(/\s+/g,' ').trim()).join('\n'));
    }
    const text=pages.join('\n');if(text.trim().length<50)throw Error('El PDF no tiene texto legible. Puede ser una imagen escaneada; usá carga manual.');return text;
  }finally{await task.destroy();}
}
