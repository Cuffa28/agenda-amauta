import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useRepoMutation } from '@/data/use-repo-mutation';
import type { Position } from '@/domain/schemas';

/** Quita la asociación de Agenda; nunca elimina el archivo original de Drive. */
export function PdfAttachment({ position }: { position: Position }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const remove = useRepoMutation((repo, _: void) => repo.removePositionPdf(position.id, position.clientId), {
    success: 'PDF quitado de la ficha. Los datos de la posición se conservan.',
    invalidate: ['positions', 'position-history', 'review-position'],
    onSuccess: saved => {
      queryClient.setQueriesData<Position[]>({ queryKey: ['positions'] }, old => old?.map(p => p.id === saved.id ? saved : p));
      queryClient.setQueryData(['review-position', saved.id], saved);
      setConfirming(false);
    },
  });
  if (!position.drivePdf) return <p className="text-xs text-muted-foreground">Sin PDF adjunto. El detalle importado se conserva; podés cargar una nueva posición debajo.</p>;
  return <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0"/><span className="break-all text-sm font-medium">{position.drivePdf.fileName}</span></div>
      <div className="flex flex-wrap items-center gap-3">
        <a className="text-sm underline" target="_blank" rel="noopener noreferrer" href={`https://drive.google.com/file/d/${position.drivePdf.fileId}/view`}>Abrir PDF en Drive</a>
        <Button type="button" size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(true)}><Trash2 className="h-4 w-4"/>Quitar PDF</Button>
      </div>
    </div>
    {confirming && <div className="space-y-3 border-t pt-3" role="group" aria-label="Confirmar quitar PDF">
      <p className="text-sm">¿Quitar este PDF de la ficha? Se conserva la posición importada y sus revisiones. El archivo original permanece en Drive.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? 'Quitando…' : 'Confirmar quitar PDF'}</Button><Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => setConfirming(false)}>Cancelar</Button></div>
    </div>}
    {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error.message}</p>}
  </div>;
}
