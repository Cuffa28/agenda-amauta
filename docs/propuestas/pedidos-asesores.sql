-- ============================================================================
-- APLICADA el 2026-11-19 en Supabase (migración agenda_pedidos_asesores),
-- autorizada por Facundo sin revisión previa de Codex.
-- Pedidos e indicaciones de asesores · rama feat/pedidos-asesores (33bc2ab).
-- Sin asesores dados de alta: agenda_access sigue con los dos owners.
-- No toca ninguna tabla, política ni dato existente salvo el CHECK de rol de
-- agenda_access (se amplía de 'owner' a 'owner' | 'asesor').
-- Todas las políticas actuales exigen role = 'owner', así que un asesor sigue
-- sin poder leer clientes, revisiones, notas, tareas, posiciones ni borradores.
-- ============================================================================

-- 1. Rol asesor ---------------------------------------------------------------
alter table public.agenda_access drop constraint agenda_access_role_check;
alter table public.agenda_access
  add constraint agenda_access_role_check check (role in ('owner', 'asesor'));

-- 2. Funciones de permiso -------------------------------------------------------
-- Correo de la sesión, en minúsculas.
create or replace function public.agenda_me() returns text
language sql stable set search_path = '' as $$
  select lower(auth.jwt() ->> 'email')
$$;

create or replace function public.agenda_role() returns text
language sql stable security definer set search_path = '' as $$
  select a.role from public.agenda_access a
  where a.email = public.agenda_me() and a.active
$$;

-- Un asesor puede dejar pedidos sobre:
--   * los clientes asignados a su correo;
--   * los clientes sin asesor;
--   * los clientes asignados a un owner (hoy, los FA), que ven todos.
create or replace function public.agenda_advisor_can_see(p_client_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agenda_clients c
    where c.id = p_client_id and c.active
      and (
        nullif(trim(c.advisor_email), '') is null
        or lower(c.advisor_email) = public.agenda_me()
        or lower(c.advisor_email) in (
          select a.email from public.agenda_access a where a.role = 'owner' and a.active)
      )
  )
$$;

-- Lista mínima para el asesor: solo número y nombre de los clientes que puede ver.
create or replace function public.agenda_my_clients()
returns table (id text, name text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name from public.agenda_clients c
  where c.active
    and (
      public.agenda_role() = 'owner'
      or (public.agenda_role() = 'asesor' and public.agenda_advisor_can_see(c.id))
    )
  order by c.name
$$;

-- 3. Tabla de pedidos e indicaciones -------------------------------------------
create table public.agenda_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.agenda_clients(id),
  kind text not null check (kind in ('pedido', 'indicacion')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  desired_date date,
  author_email text not null,
  status text not null,
  seen_at timestamptz,
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_requests_kind_status check (
    (kind = 'pedido' and status in ('recibido', 'en_curso', 'resuelto'))
    or (kind = 'indicacion' and status in ('vigente', 'ya_no_aplica') and desired_date is null)
  )
);
create index agenda_requests_client_idx on public.agenda_requests (client_id);
create index agenda_requests_author_idx on public.agenda_requests (author_email);

-- Al crear: autor, fecha y estado inicial los pone la base, no el navegador.
create or replace function public.agenda_requests_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.author_email := public.agenda_me();
  new.created_at := now();
  new.updated_at := now();
  new.seen_at := null;
  new.status := case when new.kind = 'pedido' then 'recibido' else 'vigente' end;
  new.status_history := jsonb_build_array(jsonb_build_object(
    'status', new.status, 'by', new.author_email, 'at', now()));
  return new;
end $$;
create trigger agenda_requests_before_insert before insert on public.agenda_requests
  for each row execute function public.agenda_requests_before_insert();

-- Al actualizar: el contenido no cambia; solo estado y "visto".
-- Cada cambio de estado queda en el historial.
create or replace function public.agenda_requests_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.client_id <> old.client_id or new.kind <> old.kind or new.body <> old.body
     or new.desired_date is distinct from old.desired_date
     or new.author_email <> old.author_email or new.created_at <> old.created_at then
    raise exception 'Un pedido registrado no se edita: solo cambia su estado.';
  end if;
  if new.status <> old.status then
    new.status_history := old.status_history || jsonb_build_object(
      'status', new.status, 'by', public.agenda_me(), 'at', now());
  else
    new.status_history := old.status_history;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger agenda_requests_before_update before update on public.agenda_requests
  for each row execute function public.agenda_requests_before_update();

-- 4. Permisos (RLS) ---------------------------------------------------------------
alter table public.agenda_requests enable row level security;

-- Owner: ve y gestiona todo.
create policy agenda_requests_owner_read on public.agenda_requests
  for select to authenticated using (public.agenda_role() = 'owner');
create policy agenda_requests_owner_update on public.agenda_requests
  for update to authenticated
  using (public.agenda_role() = 'owner') with check (public.agenda_role() = 'owner');

-- Asesor: crea sobre clientes que puede ver y lee solo lo que escribió él.
create policy agenda_requests_advisor_insert on public.agenda_requests
  for insert to authenticated
  with check (public.agenda_role() = 'asesor' and public.agenda_advisor_can_see(client_id));
create policy agenda_requests_advisor_read on public.agenda_requests
  for select to authenticated
  using (public.agenda_role() = 'asesor' and author_email = public.agenda_me());

-- Sin política de DELETE: nadie borra pedidos ni indicaciones.

-- El asesor no actualiza la tabla: solo puede dar de baja SU indicación vigente.
create or replace function public.agenda_retire_indication(p_id uuid)
returns setof public.agenda_requests
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.agenda_requests r set status = 'ya_no_aplica'
  where r.id = p_id and r.kind = 'indicacion' and r.status = 'vigente'
    and (public.agenda_role() = 'owner'
         or (public.agenda_role() = 'asesor' and r.author_email = public.agenda_me()))
  returning r.*;
end $$;

revoke all on function public.agenda_role(), public.agenda_advisor_can_see(text),
  public.agenda_my_clients(), public.agenda_retire_indication(uuid) from public, anon;
grant execute on function public.agenda_role(), public.agenda_advisor_can_see(text),
  public.agenda_my_clients(), public.agenda_retire_indication(uuid) to authenticated;
revoke all on public.agenda_requests from anon;
grant select, insert, update on public.agenda_requests to authenticated;


-- ============================================================================
-- Alta de un asesor (DESPUÉS de verificar la asignación de sus clientes):
--   insert into public.agenda_access (email, role, active)
--   values ('nombre@amautainversiones.com', 'asesor', true);
-- Baja: update public.agenda_access set active = false where email = '...';
-- ============================================================================
