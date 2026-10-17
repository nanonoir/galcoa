-- Turnos de chat durables, checkpoint 1 (docs/design/durable-chat-turns.md; MVP-052).
-- Solo tabla técnica y claim/attach/close. Aditiva: no cambia C1–C4, F4 ni F7.
-- Staging y publicación atómica del borrador llegan en una migración posterior (02501):
-- esta no guarda propuestas ni toca `public.drafts`. Al recuperar un lease no hay
-- staging que limpiar todavía; la migración que lo agregue debe limpiarlo en `claim`.
-- Orden de locks: documento → turno. Reloj de lease: SQL (`clock_timestamp()`).
-- Actor explícito (`p_actor_id`) y solo `galcoa_executor` ejecuta; ni `authenticated`,
-- `anon` ni `service_role` tocan la tabla ni las RPC.

create table public.chat_turns (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  -- Sin truncar: la clave completa es parte de la identidad del turno.
  client_message_id text not null check (client_message_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  -- Intento vigente; crece en cada reclamo y actúa como fencing.
  attempt integer not null default 1 check (attempt >= 1),
  state text not null default 'en_curso' check (state in ('en_curso', 'completado', 'fallido', 'cancelado')),
  user_message_id uuid,
  agent_message_id uuid,
  lease_expires_at timestamptz,
  error_code text check (error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (document_id, client_message_id),
  unique (user_message_id),
  unique (agent_message_id),
  foreign key (user_message_id, document_id) references public.messages (id, document_id) on delete restrict,
  foreign key (agent_message_id, document_id) references public.messages (id, document_id) on delete restrict,
  check ((state = 'en_curso') = (lease_expires_at is not null)),
  check (state <> 'completado' or agent_message_id is not null),
  check (state in ('fallido', 'cancelado') or error_code is null)
);

-- Un turno completado queda inmutable; el intento nunca retrocede ni salta.
create function private.chat_turns_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'chat_turns: DELETE rechazado' using errcode = 'restrict_violation'; end if;
  if old.state = 'completado' then raise exception 'chat_turns: turno completado inmutable' using errcode = 'restrict_violation'; end if;
  if new.attempt <> old.attempt and new.attempt <> old.attempt + 1 then
    raise exception 'chat_turns: intento no monotónico' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_chat_turns_guard before update or delete on public.chat_turns
  for each row execute function private.chat_turns_guard();

alter table public.chat_turns enable row level security;
revoke all on public.chat_turns from public, anon, authenticated, service_role;

-- Rol propietario sin login ni bypass; permisos mínimos por tabla y columna.
create role galcoa_turn_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_turn_writer;
grant select, insert on public.chat_turns to galcoa_turn_writer;
grant update (attempt, state, user_message_id, lease_expires_at, error_code, updated_at) on public.chat_turns to galcoa_turn_writer;
grant select on public.documents, public.messages to galcoa_turn_writer;
-- El bloqueo `for update` del documento exige UPDATE sobre al menos una columna.
grant update (updated_at) on public.documents to galcoa_turn_writer;
grant insert on public.audit_events to galcoa_turn_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_turn_writer;
create policy turn_writer_turns on public.chat_turns to galcoa_turn_writer using (true) with check (true);
create policy turn_writer_documents_read on public.documents for select to galcoa_turn_writer using (true);
create policy turn_writer_documents_lock on public.documents for update to galcoa_turn_writer using (true) with check (true);
create policy turn_writer_messages on public.messages for select to galcoa_turn_writer using (true);
create policy turn_writer_audit on public.audit_events for insert to galcoa_turn_writer with check (true);

-- Reutiliza el DTO de mensaje de F4 (owner galcoa_f4_writer) con EXECUTE mínimo.
grant galcoa_f4_writer to postgres with set true;
set local role galcoa_f4_writer;
grant execute on function private.f4_message_json(public.messages) to galcoa_turn_writer;
reset role;
grant galcoa_f4_writer to postgres with set false, inherit false;

create function private.chat_turn_json(t public.chat_turns) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('turnId', t.id, 'documentId', t.document_id, 'clientMessageId', t.client_message_id,
    'attempt', t.attempt, 'state', t.state, 'userMessageId', t.user_message_id, 'agentMessageId', t.agent_message_id,
    'leaseExpiresAt', to_char(t.lease_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

-- Reclama el turno: nuevo, reintento tras fallo/cancelación/lease vencido, en curso o ya completado.
create function public.claim_chat_turn(p_actor_id uuid, p_document_id uuid, p_client_message_id text, p_fingerprint text,
  p_lease_seconds integer, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.chat_turns; m public.messages; retried boolean := false;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_client_message_id is null or p_client_message_id !~ '^[A-Za-z0-9_-]{8,128}$'
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
     or p_lease_seconds is null or p_lease_seconds not between 1 and 300
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  perform 1 from public.documents where id = p_document_id and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into t from public.chat_turns where document_id = p_document_id and client_message_id = p_client_message_id for update;
  if not found then
    insert into public.chat_turns(document_id, client_message_id, fingerprint, lease_expires_at)
      values(p_document_id, p_client_message_id, p_fingerprint, clock_timestamp() + make_interval(secs => p_lease_seconds))
      returning * into t;
  else
    if t.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    if t.state = 'completado' then
      select * into m from public.messages where id = t.agent_message_id and document_id = t.document_id;
      return jsonb_build_object('status', 'completed', 'turn', private.chat_turn_json(t), 'agentMessage', private.f4_message_json(m));
    end if;
    if t.state = 'en_curso' and t.lease_expires_at > clock_timestamp() then
      return jsonb_build_object('status', 'in_progress', 'turn', private.chat_turn_json(t));
    end if;
    retried := true;
    update public.chat_turns set attempt = attempt + 1, state = 'en_curso', error_code = null,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
      where id = t.id returning * into t;
  end if;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, p_actor_id::text, 'chat_turn.claimed', 'chat_turn', t.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'attempt', t.attempt, 'retried', retried));
  return jsonb_build_object('status', 'claimed', 'turn', private.chat_turn_json(t), 'retried', retried);
end
$$;

-- Vincula el mensaje del autor ya persistido; exige intento vigente y lease sin vencer.
create function public.attach_chat_turn_message(p_actor_id uuid, p_turn_id uuid, p_attempt integer, p_user_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.chat_turns; doc uuid;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  select document_id into doc from public.chat_turns where id = p_turn_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into t from public.chat_turns where id = p_turn_id for update;
  if t.attempt is distinct from p_attempt or t.state <> 'en_curso' or t.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_user_message_id is null or not exists (select 1 from public.messages
       where id = p_user_message_id and document_id = t.document_id and sender = 'autor')
     or exists (select 1 from public.chat_turns where user_message_id = p_user_message_id and id <> t.id)
     or (t.user_message_id is not null and t.user_message_id <> p_user_message_id) then
    raise invalid_parameter_value;
  end if;
  update public.chat_turns set user_message_id = p_user_message_id, updated_at = clock_timestamp()
    where id = t.id returning * into t;
  return jsonb_build_object('status', 'attached', 'turn', private.chat_turn_json(t));
end
$$;

-- Cierra solo el intento vigente como fallido/cancelado. No toca mensajes ni turnos completados.
create function public.close_chat_turn(p_actor_id uuid, p_turn_id uuid, p_attempt integer, p_state text, p_error_code text,
  p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.chat_turns; doc uuid;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_state is null or p_state not in ('fallido', 'cancelado')
     or p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.chat_turns where id = p_turn_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into t from public.chat_turns where id = p_turn_id for update;
  if t.attempt is distinct from p_attempt then return jsonb_build_object('status', 'stale'); end if;
  -- Repetición idéntica del cierre: mismo resultado, sin segundo evento.
  if t.state = p_state and t.error_code = p_error_code then
    return jsonb_build_object('status', 'closed', 'turn', private.chat_turn_json(t));
  end if;
  if t.state <> 'en_curso' then return jsonb_build_object('status', 'stale'); end if;
  update public.chat_turns set state = p_state, error_code = p_error_code, lease_expires_at = null, updated_at = clock_timestamp()
    where id = t.id returning * into t;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(t.document_id, p_actor_id::text, 'chat_turn.closed', 'chat_turn', t.id,
      case when p_state = 'fallido' then 'error' else 'ok' end,
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'attempt', t.attempt, 'state', p_state, 'errorCode', p_error_code));
  return jsonb_build_object('status', 'closed', 'turn', private.chat_turn_json(t));
end
$$;

-- Propiedad y permisos de ejecución (mismo mecanismo que F4/F7).
grant create on schema public, private to galcoa_turn_writer;
grant galcoa_turn_writer to postgres with set true;
alter function private.chat_turn_json(public.chat_turns) owner to galcoa_turn_writer;
alter function public.claim_chat_turn(uuid, uuid, text, text, integer, text) owner to galcoa_turn_writer;
alter function public.attach_chat_turn_message(uuid, uuid, integer, uuid) owner to galcoa_turn_writer;
alter function public.close_chat_turn(uuid, uuid, integer, text, text, text) owner to galcoa_turn_writer;
set local role galcoa_turn_writer;
revoke all on function private.chat_turn_json(public.chat_turns) from public, anon, authenticated, service_role, galcoa_executor;
revoke all on function public.claim_chat_turn(uuid, uuid, text, text, integer, text),
  public.attach_chat_turn_message(uuid, uuid, integer, uuid),
  public.close_chat_turn(uuid, uuid, integer, text, text, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.claim_chat_turn(uuid, uuid, text, text, integer, text),
  public.attach_chat_turn_message(uuid, uuid, integer, uuid),
  public.close_chat_turn(uuid, uuid, integer, text, text, text) to galcoa_executor;
reset role;
revoke create on schema public, private from galcoa_turn_writer;
grant galcoa_turn_writer to postgres with set false, inherit false;
