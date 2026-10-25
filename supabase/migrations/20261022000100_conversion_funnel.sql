-- Embudo de conversión (docs/exec-plans/active/conversion-funnel.md, D5–D7). Aditiva.
-- Mismo patrón F4/F7: tablas sin acceso directo de roles de API, escritas solo por funciones
-- SECURITY DEFINER con owner dedicado sin login ni bypass de RLS. Sin datos personales en el
-- embudo: identificador aleatorio de navegador, nombre de evento de lista cerrada y etiquetas cortas.
-- No aplicada a galcoa-dev: requiere autorización explícita del líder (AGENTS.md).

create role galcoa_conversion_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_conversion_writer;

create function private.conversion_actor() returns uuid
language sql stable security definer set search_path = '' as $$ select auth.uid() $$;
revoke all on function private.conversion_actor() from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function private.conversion_actor() to galcoa_conversion_writer;

-- Etapas del embudo --------------------------------------------------------------------------
create table public.funnel_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  visitor_id uuid not null,
  user_id uuid null references auth.users (id) on delete set null,
  event text not null check (event in (
    'landing_viewed', 'cta_clicked', 'demo_started', 'demo_step_viewed', 'demo_verdict_shown', 'demo_completed',
    'signup_viewed', 'signup_completed', 'activation_step_completed', 'pricing_viewed', 'plan_selected',
    'subscription_requested')),
  step text null check (step ~ '^[a-z0-9_]{1,40}$'),
  source text null check (source ~ '^[a-z0-9_]{1,40}$'),
  plan text null check (plan in ('inicial', 'crecimiento', 'pro'))
);
create index funnel_events_event_time_idx on public.funnel_events (event, occurred_at);
create index funnel_events_visitor_time_idx on public.funnel_events (visitor_id, occurred_at);
alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from public, anon, authenticated, service_role;
grant select, insert on public.funnel_events to galcoa_conversion_writer;
create policy conversion_writer_funnel on public.funnel_events to galcoa_conversion_writer using (true) with check (true);

-- Solicitudes de suscripción (sin cobro en P0: el equipo las activa en el piloto) ------------
create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('inicial', 'crecimiento', 'pro')),
  status text not null default 'solicitada' check (status in ('solicitada', 'activa', 'cancelada')),
  idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, idempotency_key)
);
create unique index subscription_requests_one_open_idx on public.subscription_requests (user_id, plan) where status = 'solicitada';
alter table public.subscription_requests enable row level security;
revoke all on public.subscription_requests from public, anon, authenticated, service_role;
grant select, insert on public.subscription_requests to galcoa_conversion_writer;
create policy conversion_writer_subscriptions on public.subscription_requests to galcoa_conversion_writer using (true) with check (true);

-- Registro de un evento: anónimo o con sesión. Tope por visitante para limitar ruido y abuso:
-- por encima de 60 eventos por minuto se descarta en silencio (la medición nunca falla al usuario).
create function public.record_funnel_event(p_visitor_id uuid, p_event text, p_step text, p_source text, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
declare recent integer;
begin
  if p_visitor_id is null or p_event is null then raise invalid_parameter_value; end if;
  select count(*) into recent from public.funnel_events
    where visitor_id = p_visitor_id and occurred_at > clock_timestamp() - interval '1 minute';
  if recent >= 60 then return; end if;
  insert into public.funnel_events (visitor_id, user_id, event, step, source, plan)
    values (p_visitor_id, private.conversion_actor(), p_event, p_step, p_source, p_plan);
end
$$;

-- Solicitud de plan del usuario con sesión. Idempotente por clave y una sola abierta por plan.
create function public.request_subscription(p_plan text, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.conversion_actor();
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_plan is null or p_plan not in ('inicial', 'crecimiento', 'pro') or p_idempotency_key is null then
    raise invalid_parameter_value;
  end if;
  if exists (select 1 from public.subscription_requests
             where user_id = actor and (idempotency_key = p_idempotency_key or (plan = p_plan and status = 'solicitada'))) then
    return jsonb_build_object('status', 'ya_solicitada', 'plan', p_plan);
  end if;
  insert into public.subscription_requests (user_id, plan, idempotency_key) values (actor, p_plan, p_idempotency_key);
  return jsonb_build_object('status', 'solicitada', 'plan', p_plan);
exception when unique_violation then
  return jsonb_build_object('status', 'ya_solicitada', 'plan', p_plan);
end
$$;

-- Cambio explícito de owner; CREATE temporal, nunca en runtime (igual que F4/F7).
grant create on schema public to galcoa_conversion_writer;
grant galcoa_conversion_writer to postgres with set true;
alter function public.record_funnel_event(uuid, text, text, text, text) owner to galcoa_conversion_writer;
alter function public.request_subscription(text, uuid) owner to galcoa_conversion_writer;
set local role galcoa_conversion_writer;
revoke all on function public.record_funnel_event(uuid, text, text, text, text) from public, anon, authenticated, service_role, galcoa_executor;
revoke all on function public.request_subscription(text, uuid) from public, anon, authenticated, service_role, galcoa_executor;
-- Superficie anónima nueva y acotada: solo registrar etapas del embudo (sin lectura).
grant execute on function public.record_funnel_event(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.request_subscription(text, uuid) to authenticated;
reset role;
revoke create on schema public from galcoa_conversion_writer;
grant galcoa_conversion_writer to postgres with set false, inherit false;

-- Lectura para análisis (solo roles de servidor con acceso a la base, nunca API):
-- select event, count(distinct visitor_id) from public.funnel_events
--   where occurred_at > now() - interval '30 days' group by event order by 2 desc;
