-- F4, checkpoint #10. Aditiva: no cambia guardas C1–C4.
-- Autor: auth.uid(); agente/auditoría: solo ejecutor con actor verificado.
-- El owner de funciones no tiene login, bypass, membresías ni propiedad de tablas.
create role galcoa_f4_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_f4_writer;
-- Supabase no permite al migrador delegar USAGE sobre auth (owner del proveedor).
-- Puente mínimo: solo devuelve auth.uid(), sin tablas ni actor como argumento.
create function private.f4_actor() returns uuid
language sql stable security definer set search_path = '' as $$ select auth.uid() $$;
revoke all on function private.f4_actor() from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function private.f4_actor() to galcoa_f4_writer;
grant select, insert on public.documents to galcoa_f4_writer;
grant update (message_seq, updated_at) on public.documents to galcoa_f4_writer;
grant select, insert on public.messages, public.audit_events, public.idempotency_records to galcoa_f4_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_f4_writer;
grant select (id, confirmation_status) on public.document_revisions to galcoa_f4_writer;
grant select (id, version_id, outcome, created_at) on public.hedera_attempts to galcoa_f4_writer;
grant select (version_id) on public.hedera_registrations to galcoa_f4_writer;
create policy f4_writer_documents on public.documents to galcoa_f4_writer using (true) with check (true);
create policy f4_writer_messages on public.messages to galcoa_f4_writer using (true) with check (true);
create policy f4_writer_audit on public.audit_events to galcoa_f4_writer using (true) with check (true);
create policy f4_writer_idempotency on public.idempotency_records to galcoa_f4_writer using (true) with check (true);
create policy f4_reader_revisions on public.document_revisions for select to galcoa_f4_writer using (true);
create policy f4_reader_attempts on public.hedera_attempts for select to galcoa_f4_writer using (true);
create policy f4_reader_registrations on public.hedera_registrations for select to galcoa_f4_writer using (true);

create function private.f4_document_json(d public.documents) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'documentId', d.id, 'ownerId', d.owner_id, 'title', d.title,
    'documentStatus', d.document_status, 'controlStatus', d.control_status,
    'confirmationStatus', (select r.confirmation_status from public.document_revisions r where r.id = d.active_revision_id),
    'hcsStatus', case
      when exists (select 1 from public.hedera_registrations r where r.version_id = d.last_version_id) then 'registrado'
      else coalesce((select case when a.outcome = 'incierto' then 'pendiente' else a.outcome end from public.hedera_attempts a where a.version_id = d.last_version_id order by a.created_at desc, a.id desc limit 1), 'no_iniciado') end,
    'activeRevisionId', d.active_revision_id,
    'createdAt', to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt', to_char(d.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;
create function private.f4_message_json(m public.messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('messageId', m.id, 'documentId', m.document_id,
    'sender', m.sender, 'content', m.content, 'declaredEventDate', m.declared_event_date,
    'uploadedAt', to_char(m.uploaded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

-- La RPC de autor también es invocable sin Next: valida la forma compartida.
create function private.f4_valid_declared(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if value = '{"kind":"unknown"}'::jsonb then return true; end if;
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not (value ?& array['kind', 'originalText', 'precision', 'timeZone', 'instant'])
    or value - array['kind', 'originalText', 'precision', 'timeZone', 'instant'] <> '{}'::jsonb
    or value->>'kind' is distinct from 'declared'
    or jsonb_typeof(value->'originalText') <> 'string' or char_length(value->>'originalText') = 0
    or value->>'precision' is null or value->>'precision' not in ('year', 'month', 'day', 'datetime')
    or not (value->'timeZone' = 'null'::jsonb or (jsonb_typeof(value->'timeZone') = 'string' and char_length(value->>'timeZone') > 0))
    then return false; end if;
  if value->'instant' = 'null'::jsonb then return true; end if;
  if jsonb_typeof(value->'instant') <> 'string' or value->>'precision' <> 'datetime'
    or value->'timeZone' = 'null'::jsonb
    or value->>'instant' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then return false; end if;
  perform (value->>'instant')::timestamptz;
  return true;
exception when datetime_field_overflow or invalid_datetime_format then return false;
end
$$;

create function public.create_document(p_title text, p_key text, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; prior public.idempotency_records;
  fp text := encode(sha256(convert_to(jsonb_build_object('title', p_title)::text, 'UTF8')), 'hex');
  result jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200
     or p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,128}$'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  -- No existe aún documento raíz. Serializa solo creaciones de este actor.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select * into prior from public.idempotency_records
    where actor_scope = actor::text and resource_id = actor and action = 'document.create' and key = p_key;
  if found then
    if prior.fingerprint <> fp then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    select * into d from public.documents where id = (prior.result->>'documentId')::uuid and owner_id = actor;
    return jsonb_build_object('status', 'replayed', 'value', private.f4_document_json(d));
  end if;
  insert into public.documents(owner_id, title) values(actor, p_title) returning * into d;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(d.id, actor::text, 'document.created', 'document', d.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, actor, 'document.create', p_key, fp, jsonb_build_object('documentId', d.id));
  return jsonb_build_object('status', 'created', 'value', private.f4_document_json(d));
end
$$;

-- Auxiliar no expuesto. El wrapper público de autor NO acepta sender ni actor.
create function private.f4_append_message(actor uuid, doc uuid, sender text, content text, declared jsonb, idem_key text, correlation text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  d public.documents; m public.messages; prior public.idempotency_records;
  action_name text := case when sender = 'autor' then 'message.record' else 'message.record_agent' end;
  fp text := encode(sha256(convert_to(jsonb_build_object('sender', sender, 'content', content, 'declaredEventDate', declared)::text, 'UTF8')), 'hex');
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into d from public.documents where id = doc and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if sender not in ('autor', 'agente') or content is null or char_length(btrim(content)) = 0 or char_length(content) > 8000
     or not private.f4_valid_declared(declared)
     or idem_key is null or idem_key !~ '^[A-Za-z0-9_-]{8,128}$'
     or correlation is null or char_length(correlation) not between 1 and 128 then raise invalid_parameter_value; end if;
  select * into prior from public.idempotency_records
    where actor_scope = actor::text and resource_id = doc and action = action_name and key = idem_key;
  if found then
    if prior.fingerprint <> fp then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    select * into m from public.messages where id = (prior.result->>'messageId')::uuid and document_id = doc;
    return jsonb_build_object('status', 'replayed', 'value', private.f4_message_json(m));
  end if;
  update public.documents set message_seq = message_seq + 1, updated_at = clock_timestamp() where id = doc returning * into d;
  insert into public.messages(document_id, sequence, sender, content, declared_event_date)
    values(doc, d.message_seq, sender, content, declared) returning * into m;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, actor::text, 'message.recorded', 'message', m.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', correlation));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, doc, action_name, idem_key, fp, jsonb_build_object('messageId', m.id));
  return jsonb_build_object('status', 'created', 'value', private.f4_message_json(m));
end
$$;
create function public.append_message(p_document_id uuid, p_content text, p_declared_event_date jsonb, p_key text, p_correlation_id text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.f4_append_message(private.f4_actor(), p_document_id, 'autor', p_content, p_declared_event_date, p_key, p_correlation_id)
$$;
create function public.append_agent_message(p_actor_id uuid, p_document_id uuid, p_content text, p_declared_event_date jsonb, p_key text, p_correlation_id text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.f4_append_message(p_actor_id, p_document_id, 'agente', p_content, p_declared_event_date, p_key, p_correlation_id)
$$;

create function public.list_documents() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.f4_document_json(d) order by d.updated_at desc, d.id), '[]'::jsonb)
    from public.documents d where d.owner_id = private.f4_actor()
$$;
create function public.get_document(p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.f4_document_json(d) from public.documents d where d.id = p_document_id and d.owner_id = private.f4_actor()
$$;
create function public.list_messages(p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select (select coalesce(jsonb_agg(private.f4_message_json(m) order by m.sequence), '[]'::jsonb)
    from public.messages m where m.document_id = d.id)
  from public.documents d where d.id = p_document_id and d.owner_id = private.f4_actor()
$$;

-- Autoría del evento revalidada, sin payload libre ni recurso de otro documento.
create function public.append_document_audit(p_actor_id uuid, p_document_id uuid, p_type text, p_resource_id uuid, p_outcome text, p_correlation_id text, p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare prior public.idempotency_records; resource_kind text; fp text;
begin
  perform 1 from public.documents where id = p_document_id and owner_id = p_actor_id for update;
  if not found then raise insufficient_privilege; end if;
  if p_type = 'document.created' and p_resource_id = p_document_id then resource_kind := 'document';
  elsif p_type = 'message.recorded' and exists(select 1 from public.messages where id = p_resource_id and document_id = p_document_id) then resource_kind := 'message';
  else raise invalid_parameter_value; end if;
  if p_outcome is null or p_outcome not in ('ok', 'rechazado', 'error')
    or p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,128}$'
    or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then raise invalid_parameter_value; end if;
  fp := encode(sha256(convert_to(jsonb_build_object('type', p_type, 'resourceId', p_resource_id, 'outcome', p_outcome, 'correlationId', p_correlation_id)::text, 'UTF8')), 'hex');
  select * into prior from public.idempotency_records where actor_scope = p_actor_id::text and resource_id = p_document_id and action = 'audit.append' and key = p_key;
  if found then
    if prior.fingerprint <> fp then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    return 'replayed';
  end if;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, p_actor_id::text, p_type, resource_kind, p_resource_id, p_outcome, jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(p_actor_id::text, p_document_id, 'audit.append', p_key, fp, '{}'::jsonb);
  return 'created';
end
$$;

-- Cambio explícito de owner; CREATE temporal, nunca en runtime.
grant create on schema public, private to galcoa_f4_writer;
-- El migrador Supabase no es superusuario. PG17 exige SET para transferir owner.
grant galcoa_f4_writer to postgres with set true;
alter function private.f4_document_json(public.documents) owner to galcoa_f4_writer;
alter function private.f4_message_json(public.messages) owner to galcoa_f4_writer;
alter function private.f4_valid_declared(jsonb) owner to galcoa_f4_writer;
alter function private.f4_append_message(uuid, uuid, text, text, jsonb, text, text) owner to galcoa_f4_writer;
alter function public.create_document(text, text, text) owner to galcoa_f4_writer;
alter function public.append_message(uuid, text, jsonb, text, text) owner to galcoa_f4_writer;
alter function public.append_agent_message(uuid, uuid, text, jsonb, text, text) owner to galcoa_f4_writer;
alter function public.list_documents() owner to galcoa_f4_writer;
alter function public.get_document(uuid) owner to galcoa_f4_writer;
alter function public.list_messages(uuid) owner to galcoa_f4_writer;
alter function public.append_document_audit(uuid, uuid, text, uuid, text, text, text) owner to galcoa_f4_writer;
grant usage on schema public to galcoa_executor;
set local role galcoa_f4_writer;
revoke all on function private.f4_document_json(public.documents), private.f4_message_json(public.messages), private.f4_valid_declared(jsonb),
  private.f4_append_message(uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated, service_role, galcoa_executor;
revoke all on function public.create_document(text, text, text), public.append_message(uuid, text, jsonb, text, text),
  public.append_agent_message(uuid, uuid, text, jsonb, text, text), public.list_documents(), public.get_document(uuid),
  public.list_messages(uuid), public.append_document_audit(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.create_document(text, text, text), public.append_message(uuid, text, jsonb, text, text),
  public.list_documents(), public.get_document(uuid), public.list_messages(uuid) to authenticated;
grant execute on function public.append_agent_message(uuid, uuid, text, jsonb, text, text),
  public.append_document_audit(uuid, uuid, text, uuid, text, text, text) to galcoa_executor;
reset role;
revoke create on schema public, private from galcoa_f4_writer;
grant galcoa_f4_writer to postgres with set false, inherit false;
