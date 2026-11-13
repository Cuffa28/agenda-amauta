import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from '@/components/ficha/ReviewPanel';
import { EmailDraftPanel } from '@/components/ficha/EmailDraftPanel';
import { reviewsQuery } from '@/data/queries';
import { portfolioMonthStatus } from '@/domain/coverage';
import type { Review } from '@/domain/schemas';
import type { DraftSource } from '@/domain/email-draft';

const mock = vi.hoisted(() => ({ start: vi.fn(), list: vi.fn(), cancel: vi.fn() }));
vi.mock('@/data/index', () => ({ getRepository: () => ({ startReview: mock.start, listReviews: mock.list, cancelEmptyReview: mock.cancel }) }));
vi.mock('@/integrations/google/GoogleConnection', () => ({ GoogleConnection: () => null, useGoogleWorkspace: () => ({ connected: false, email: '' }) }));
const review: Review = { id:'review-1', clientId:'00123-00', month:'2026-11', status:'en_curso', positionId:null,
  decision:null, previousConclusion:null, marketViewSnapshot:null, startedAt:'2026-11-13T12:00:00Z', closedAt:null };
const source: DraftSource = { client:{id:review.clientId,name:'Cartera de prueba',segment:'Alto',advisorId:'advisor',reviewDay:0,isDemo:true},
  advisor:{id:'advisor',name:'Asesor de prueba',email:'asesor@example.com'}, position:null, review };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Harness() {
  const {data=[]}=useQuery({...reviewsQuery(review.clientId), initialData:[], staleTime:Infinity});
  return <ReviewPanel clientId={review.clientId} month={review.month} status={portfolioMonthStatus(source.client,review.month,data,[],'2026-11-13')} marketView={{id:'m',name:'Mercado',versions:[]}} />;
}
describe('Inicio de revisión y borrador rápido', () => {
  it('muestra progreso y abre la decisión con la respuesta guardada, sin esperar una recarga global', async () => {
    let finish!: (r:Review)=>void;
    mock.start.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    client.setQueryData(['reviews'],[]);
    render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button',{name:'Iniciar revisión'}));
    await waitFor(() => expect(screen.getByRole('button',{name:'Iniciando…'})).toBeDisabled());
    expect(mock.start).toHaveBeenCalledTimes(1);
    await act(async () => finish(review));
    expect(await screen.findByRole('button',{name:'Guardar decisión'})).toBeVisible();
    expect(client.getQueryData(['reviews'])).toEqual([review]);
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('prepara destinatario y asunto al abrir y copia exactamente el texto editado', async () => {
    const writeText=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
    render(<QueryClientProvider client={new QueryClient()}><EmailDraftPanel source={source} saved={undefined}/></QueryClientProvider>);
    expect(screen.getByRole('textbox',{name:'Destinatario del borrador'})).toHaveValue('asesor@example.com');
    expect((screen.getByRole('textbox',{name:'Asunto'}) as HTMLInputElement).value).toContain('Cartera de prueba');
    fireEvent.change(screen.getByRole('textbox',{name:'Cuerpo editable'}),{target:{value:'Este es el texto editado que quiero revisar antes de enviar.'}});
    fireEvent.click(screen.getByRole('button',{name:'Copiar para este chat'}));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Para: asesor@example.com')));
    expect(writeText.mock.calls[0]?.[0]).toContain('Este es el texto editado');
  });
  it('cierra una prueba vacía sin exigir decisión ni marcarla como revisada', async () => {
    mock.cancel.mockResolvedValue(review);
    const client=new QueryClient();
    client.setQueryData(['reviews'],[review]);client.setQueryData(['reviews',review.clientId],[review]);
    render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button',{name:'Cerrar revisión'}));
    expect(await screen.findByRole('button',{name:'Iniciar revisión'})).toBeVisible();
    expect(mock.cancel).toHaveBeenCalledWith(review.id);
    expect(screen.queryByText('Elegí una decisión')).not.toBeInTheDocument();
    expect(client.getQueryData(['reviews'])).toEqual([]);
  });

});
