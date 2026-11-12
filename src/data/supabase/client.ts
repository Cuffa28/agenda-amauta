import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Falta configurar la conexión de Agenda.');
  client = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function requireAgendaSession() {
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) throw new Error('Ingresá con tu cuenta autorizada.');
  const { data, error: accessError } = await supabase.from('agenda_access').select('email').eq('email', user.email.toLowerCase()).eq('active', true).maybeSingle();
  if (accessError || !data) throw new Error('Esta cuenta no tiene acceso a Agenda Amauta.');
  return { supabase, user };
}
