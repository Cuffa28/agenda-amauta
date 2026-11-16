import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {QuickReview} from '@/components/ficha/QuickReview';
const mocks=vi.hoisted(()=>({start:vi.fn(),save:vi.fn(),close:vi.fn()}));
vi.mock('@/data/index',()=>({getRepository:()=>({startReview:mocks.start,saveDecision:mocks.save,closeReview:mocks.close})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('registra mantener sin nota y cierra con una sola acción de guardado',async()=>{
 const r={id:'r',clientId:'c',month:'2026-11',status:'cerrada',decision:{type:'mantener',nota:''}};
 mocks.start.mockResolvedValue({...r,status:'en_curso'});mocks.save.mockResolvedValue(r);mocks.close.mockResolvedValue(r);
 const cache=new QueryClient();cache.setQueryData(['reviews'],[]);render(<QueryClientProvider client={cache}><QuickReview clientId="c" month="2026-11" review={null}/></QueryClientProvider>);
 expect(screen.getByRole('button',{name:'Guardar revisión'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Mantener'}));fireEvent.click(screen.getByRole('button',{name:'Guardar revisión'}));
 await waitFor(()=>expect(mocks.close).toHaveBeenCalledWith('r'));
 expect(mocks.save).toHaveBeenCalledWith('r',{type:'mantener',nota:''});
 await waitFor(()=>expect(cache.getQueryData(['reviews'])).toEqual([r]));
});
it('si falla el cierre conserva la nota y permite reintentar',async()=>{
 mocks.start.mockResolvedValue({id:'r'});mocks.save.mockResolvedValue({});mocks.close.mockRejectedValue(Error('No se pudo guardar'));
 render(<QueryClientProvider client={new QueryClient()}><QuickReview clientId="c" month="2026-11" review={null}/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Recomiendo cambio'}));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Revisar saldo disponible'}});fireEvent.click(screen.getByRole('button',{name:'Guardar revisión'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');expect(screen.getByRole('textbox')).toHaveValue('Revisar saldo disponible');expect(screen.getByRole('button',{name:'Guardar revisión'})).toBeEnabled();
});
