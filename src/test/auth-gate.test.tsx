import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from '@/components/AuthGate';

const api = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), requireSession: vi.fn() }));
vi.mock('@/data/supabase/client', () => ({ getSupabase: () => ({ auth: api }), requireAgendaSession: () => api.requireSession() }));
const session = { user: { id: 'test-user', email: 'advisor@example.com' } };
function mount() {
  return render(<QueryClientProvider client={new QueryClient()}><AuthGate><div>Ficha privada</div></AuthGate></QueryClientProvider>);
}
beforeEach(() => {
  vi.stubEnv('VITE_AGENDA_MODE', ''); vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'false'); vi.stubEnv('VITE_EMAIL_LINK_ENABLED', 'false');
  api.getSession.mockResolvedValue({ data: { session: null }, error: null });
  api.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  api.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
  api.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  api.verifyOtp.mockResolvedValue({ data: { session }, error: null });
  api.requireSession.mockResolvedValue({ user: session.user });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe('Acceso a Agenda', () => {
  it('ingresa con la cuenta existente y espera la autorización antes de mostrar la ficha', async () => {
    let authorize!: () => void;
    api.requireSession.mockReturnValue(new Promise<void>(resolve => { authorize = resolve; }));
    mount();
    fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: 'Advisor@Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'synthetic-test-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ingresar$/ }));
    await waitFor(() => expect(api.signInWithPassword).toHaveBeenCalledWith({ email: 'advisor@example.com', password: 'synthetic-test-password' }));
    expect(screen.queryByText('Ficha privada')).not.toBeInTheDocument();
    authorize();
    expect(await screen.findByText('Ficha privada')).toBeInTheDocument();
    expect(api.signInWithOtp).not.toHaveBeenCalled();
  });
  it('recupera una sesión existente al reabrir', async () => {
    api.getSession.mockResolvedValue({ data: { session }, error: null });
    mount();
    expect(await screen.findByText('Ficha privada')).toBeInTheDocument();
    expect(api.signInWithPassword).not.toHaveBeenCalled();
  });
  it('no muestra datos si la cuenta autenticada no está autorizada', async () => {
    api.getSession.mockResolvedValue({ data: { session }, error: null });
    api.requireSession.mockRejectedValue(new Error('Esta cuenta no tiene acceso a Agenda Amauta.'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no tiene acceso');
    expect(screen.queryByText('Ficha privada')).not.toBeInTheDocument();
  });
  it('muestra el error de credenciales sin ofrecer métodos todavía sin configurar', async () => {
    api.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials' } });
    mount();
    fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: 'advisor@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'synthetic-wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ingresar$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('correo o la contraseña no son correctos');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.queryByText('Recibir enlace de acceso')).not.toBeInTheDocument();
    expect(screen.queryByText('Ingresar con Google')).not.toBeInTheDocument();
  });
  it('envía un código y verifica el correo sin pedir contraseña ni abrir enlaces', async () => {
    mount();
    fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: 'Advisor@Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recibir código de acceso' }));
    const codeInput = await screen.findByLabelText('Código de acceso');
    expect(api.signInWithOtp).toHaveBeenCalledWith({ email: 'advisor@example.com', options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar código e ingresar' }));
    expect(await screen.findByText('Ficha privada')).toBeInTheDocument();
    expect(api.verifyOtp).toHaveBeenCalledWith({ email: 'advisor@example.com', token: '123456', type: 'email' });
    expect(api.signInWithPassword).not.toHaveBeenCalled();
  });
  it('mantiene bloqueada la ficha cuando el código está vencido', async () => {
    api.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired' } });
    mount();
    fireEvent.change(await screen.findByLabelText('Correo'), { target: { value: 'advisor@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recibir código de acceso' }));
    fireEvent.change(await screen.findByLabelText('Código de acceso'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar código e ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código venció');
    expect(screen.queryByText('Ficha privada')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Código de acceso')).toHaveValue('');
  });

});
