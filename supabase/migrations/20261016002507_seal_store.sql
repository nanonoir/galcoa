-- Almacén del sello HCS (MVP-091/092; SH-06; manifest-hcs §4–5). Aditiva sobre C3 (000300): sin tablas nuevas.
-- RPC para el adaptador de `SealingStore`; solo `galcoa_executor` las ejecuta, con actor explícito (`p_actor_id`).
--
--   · get_seal_version    → versión publicada del actor: referencia pública y manifestHash.
--   · get_seal_state      → registro probado y último intento. Proyección mínima: NUNCA `payload` ni `signed_bytes`.
--   · record_seal_intent  → intención `pendiente`, antes de enviar. Índice único de intento activo + lock
--                           advisory por versión; fencing monótono por versión (intento nuevo = máximo + 1).
--   · record_seal_outcome → resultado de un intento activo; el fencing debe coincidir (`stale_fencing`).
--   · record_seal_registration → atómico: intento → `registrado` + inserción en `hedera_registrations`.
--
-- `signed_bytes` solo entra (intención) y no sale por ninguna RPC: el servicio no reenvía bytes, reconcilia
-- por ID de transacción con el Mirror. Si un diseño futuro exige reenviar exactamente los mismos bytes, hará
-- falta una RPC propia y explícita. Auditoría mínima: ids, resultado y fencing; nunca payload ni bytes.
-- El instante de consenso exacto (`segundos.nanos`) se conserva en `observation.consensusTimestamp` porque
-- `timestamptz` trunca a microsegundos. Propietario: `galcoa_seal_writer` (mismo mecanismo que 02502).

create role galcoa_seal_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_seal_writer;
grant select on public.documents, public.document_versions, public.hedera_registrations to galcoa_seal_writer;
-- Sin lectura de `payload` ni `signed_bytes`: ni siquiera el propietario de la función puede proyectarlos.
grant select (id, version_id, payload_hash, transaction_id, claim_fencing, outcome, observation, created_at)
  on public.hedera_attempts to galcoa_seal_writer;
grant insert on public.hedera_attempts, public.hedera_registrations, public.audit_events to galcoa_seal_writer;
grant update (outcome, observation, updated_at) on public.hedera_attempts to galcoa_seal_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_seal_writer;
create policy seal_documents_read on public.documents for select to galcoa_seal_writer using (true);
create policy seal_versions_read on public.document_versions for select to galcoa_seal_writer using (true);
create policy seal_attempts_read on public.hedera_attempts for select to galcoa_seal_writer using (true);
create policy seal_attempts_insert on public.hedera_attempts for insert to galcoa_seal_writer with check (true);
create policy seal_attempts_update on public.hedera_attempts for update to galcoa_seal_writer using (true) with check (true);
create policy seal_registrations_read on public.hedera_registrations for select to galcoa_seal_writer using (true);
create policy seal_registrations_insert on public.hedera_registrations for insert to galcoa_seal_writer with check (true);
create policy seal_audit_insert on public.audit_events for insert to galcoa_seal_writer with check (true);

-- Observación mínima y sin secretos: llaves y formas cerradas.
create function private.seal_observation_ok(o jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(o) = 'object' and (o - 'topicId' - 'network' - 'sequenceNumber' - 'hederaStatus' - 'reason' - 'consensusTimestamp') = '{}'::jsonb
    and not exists (select 1 from jsonb_each(o) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 300)
    and coalesce(o->>'topicId', '') ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    and o->>'network' = 'testnet'
    and coalesce(o->>'sequenceNumber', '1') ~ '^[0-9]{1,18}$'
$$;

create function public.get_seal_version(p_actor_id uuid, p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.document_versions;
begin
  if p_actor_id is null or p_version_id is null then raise invalid_parameter_value; end if;
  select dv.* into v from public.document_versions dv join public.documents d on d.id = dv.document_id
    where dv.id = p_version_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  return jsonb_build_object('status', 'ready', 'versionId', v.id, 'reference', v.public_reference, 'manifestHash', v.manifest_hash);
end
$$;

create function public.get_seal_state(p_actor_id uuid, p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.hedera_registrations; reg jsonb; latest jsonb; ts text; exact text;
begin
  if p_actor_id is null or p_version_id is null then raise invalid_parameter_value; end if;
  perform 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    where dv.id = p_version_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into r from public.hedera_registrations where version_id = p_version_id;
  if found then
    select observation->>'consensusTimestamp' into exact from public.hedera_attempts where id = r.attempt_id;
    ts := coalesce(exact, floor(extract(epoch from r.consensus_timestamp))::bigint::text || '.' ||
      lpad((extract(microseconds from r.consensus_timestamp)::bigint % 1000000 * 1000)::text, 9, '0'));
    reg := jsonb_build_object('attemptId', r.attempt_id, 'payloadHash', r.payload_hash, 'network', r.network, 'topicId', r.topic_id,
      'transactionId', r.transaction_id, 'sequenceNumber', r.sequence_number::text, 'consensusTimestamp', ts);
  end if;
  -- Proyección explícita: sin `payload` ni `signed_bytes`.
  select jsonb_build_object('id', a.id, 'payloadHash', a.payload_hash, 'transactionId', a.transaction_id, 'outcome', a.outcome,
      'claimFencing', a.claim_fencing, 'observation', coalesce(a.observation, '{}'::jsonb))
    into latest from public.hedera_attempts a where a.version_id = p_version_id order by a.claim_fencing desc limit 1;
  return jsonb_build_object('status', 'ok', 'registration', reg, 'latestAttempt', latest);
end
$$;

create function public.record_seal_intent(p_actor_id uuid, p_version_id uuid, p_payload bytea, p_payload_hash text,
  p_signed_bytes bytea, p_transaction_id text, p_valid_start timestamptz, p_valid_until timestamptz, p_topic_id text,
  p_network text, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.document_versions; prev_fencing bigint; prev_hash text; fence bigint; aid uuid;
begin
  if p_actor_id is null or p_version_id is null or p_payload is null or octet_length(p_payload) not between 1 and 1024
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' or p_signed_bytes is null or octet_length(p_signed_bytes) not between 1 and 65536
     or p_transaction_id is null or char_length(p_transaction_id) not between 1 and 100
     or p_valid_start is null or p_valid_until is null or p_valid_until <= p_valid_start
     or p_network is distinct from 'testnet' or p_topic_id is null or p_topic_id !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select dv.* into v from public.document_versions dv join public.documents d on d.id = dv.document_id
    where dv.id = p_version_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  -- Serializa intenciones de la misma versión (el índice único de intento activo es el respaldo).
  perform pg_advisory_xact_lock(hashtextextended('seal:' || p_version_id::text, 0));
  if exists (select 1 from public.hedera_registrations where version_id = p_version_id) then
    return jsonb_build_object('status', 'registered');
  end if;
  if exists (select 1 from public.hedera_attempts where version_id = p_version_id and outcome in ('pendiente', 'incierto')) then
    return jsonb_build_object('status', 'active_attempt');
  end if;
  -- Un reintento reutiliza exactamente el payload anterior.
  select claim_fencing, payload_hash into prev_fencing, prev_hash from public.hedera_attempts
    where version_id = p_version_id order by claim_fencing desc limit 1;
  if found and prev_hash <> p_payload_hash then return jsonb_build_object('status', 'payload_mismatch'); end if;
  fence := coalesce(prev_fencing, 0) + 1;
  insert into public.hedera_attempts(version_id, payload, payload_hash, signed_bytes, transaction_id, valid_start, valid_until,
      claim_fencing, outcome, observation)
    values(p_version_id, p_payload, p_payload_hash, p_signed_bytes, p_transaction_id, p_valid_start, p_valid_until, fence, 'pendiente',
      jsonb_build_object('topicId', p_topic_id, 'network', p_network))
    on conflict (version_id) where outcome in ('pendiente', 'incierto') do nothing
    returning id into aid;
  if aid is null then return jsonb_build_object('status', 'active_attempt'); end if;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(v.document_id, p_actor_id::text, 'seal.intent_recorded', 'hedera_attempt', aid, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', fence));
  return jsonb_build_object('status', 'recorded', 'attemptId', aid, 'claimFencing', fence);
end
$$;

create function public.record_seal_outcome(p_actor_id uuid, p_attempt_id uuid, p_fencing bigint, p_outcome text,
  p_observation jsonb, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a_fencing bigint; a_outcome text; a_obs jsonb; doc uuid;
begin
  if p_actor_id is null or p_attempt_id is null or p_fencing is null or p_fencing < 1
     or p_outcome is null or p_outcome not in ('pendiente', 'incierto', 'fallido')
     or p_observation is null or not private.seal_observation_ok(p_observation) or p_observation ? 'consensusTimestamp'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select a0.claim_fencing, a0.outcome, a0.observation, dv.document_id into a_fencing, a_outcome, a_obs, doc
    from public.hedera_attempts a0
    join public.document_versions dv on dv.id = a0.version_id join public.documents d on d.id = dv.document_id
    where a0.id = p_attempt_id and d.owner_id = p_actor_id for update of a0;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if a_fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  if a_outcome in ('registrado', 'fallido') then
    -- Terminal: solo el mismo resultado es un reintento idempotente; no se reescribe nada.
    return jsonb_build_object('status', case when a_outcome = p_outcome then 'recorded' else 'terminal' end);
  end if;
  if p_observation->>'topicId' <> a_obs->>'topicId' then raise invalid_parameter_value; end if;
  update public.hedera_attempts set outcome = p_outcome, observation = p_observation, updated_at = clock_timestamp()
    where id = p_attempt_id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'seal.outcome_recorded', 'hedera_attempt', p_attempt_id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', a_fencing, 'result', p_outcome));
  return jsonb_build_object('status', 'recorded');
end
$$;

create function public.record_seal_registration(p_actor_id uuid, p_attempt_id uuid, p_fencing bigint, p_payload_hash text,
  p_network text, p_topic_id text, p_transaction_id text, p_sequence_number text, p_consensus_timestamp text,
  p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a_fencing bigint; a_outcome text; a_obs jsonb; a_hash text; a_tx text; a_version uuid; doc uuid; secs bigint; nanos text; consensus timestamptz;
begin
  if p_actor_id is null or p_attempt_id is null or p_fencing is null or p_fencing < 1
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' or p_network is distinct from 'testnet'
     or p_topic_id is null or p_topic_id !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
     or p_transaction_id is null or char_length(p_transaction_id) not between 1 and 100
     or p_sequence_number is null or p_sequence_number !~ '^[1-9][0-9]{0,17}$'
     or p_consensus_timestamp is null or p_consensus_timestamp !~ '^[0-9]{1,12}\.[0-9]{1,9}$'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select a0.claim_fencing, a0.outcome, a0.observation, a0.payload_hash, a0.transaction_id, a0.version_id, dv.document_id
    into a_fencing, a_outcome, a_obs, a_hash, a_tx, a_version, doc
    from public.hedera_attempts a0
    join public.document_versions dv on dv.id = a0.version_id join public.documents d on d.id = dv.document_id
    where a0.id = p_attempt_id and d.owner_id = p_actor_id for update of a0;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if a_fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  if a_hash <> p_payload_hash or a_tx is distinct from p_transaction_id or a_obs->>'topicId' <> p_topic_id then
    return jsonb_build_object('status', 'mismatch');
  end if;
  if a_outcome = 'registrado' then return jsonb_build_object('status', 'already_registered'); end if;
  if a_outcome not in ('pendiente', 'incierto') then return jsonb_build_object('status', 'terminal'); end if;
  -- Exacto: `timestamptz` guarda microsegundos; los nanosegundos viajan en la observación.
  secs := split_part(p_consensus_timestamp, '.', 1)::bigint;
  nanos := rpad(split_part(p_consensus_timestamp, '.', 2), 9, '0');
  consensus := 'epoch'::timestamptz + secs * interval '1 second' + left(nanos, 6)::bigint * interval '1 microsecond';
  update public.hedera_attempts set outcome = 'registrado', updated_at = clock_timestamp(),
      observation = a_obs || jsonb_build_object('sequenceNumber', p_sequence_number, 'consensusTimestamp', p_consensus_timestamp)
    where id = p_attempt_id;
  insert into public.hedera_registrations(version_id, attempt_id, payload_hash, network, topic_id, transaction_id, sequence_number,
      consensus_timestamp)
    values(a_version, p_attempt_id, a_hash, p_network, p_topic_id, p_transaction_id, p_sequence_number::bigint, consensus);
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'seal.registered', 'hedera_attempt', p_attempt_id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', a_fencing));
  return jsonb_build_object('status', 'registered');
end
$$;

-- Propiedad y permisos de ejecución (mismo mecanismo que 02502).
grant create on schema public, private to galcoa_seal_writer;
grant galcoa_seal_writer to postgres with set true;
alter function private.seal_observation_ok(jsonb) owner to galcoa_seal_writer;
alter function public.get_seal_version(uuid, uuid) owner to galcoa_seal_writer;
alter function public.get_seal_state(uuid, uuid) owner to galcoa_seal_writer;
alter function public.record_seal_intent(uuid, uuid, bytea, text, bytea, text, timestamptz, timestamptz, text, text, text) owner to galcoa_seal_writer;
alter function public.record_seal_outcome(uuid, uuid, bigint, text, jsonb, text) owner to galcoa_seal_writer;
alter function public.record_seal_registration(uuid, uuid, bigint, text, text, text, text, text, text, text) owner to galcoa_seal_writer;
set local role galcoa_seal_writer;
revoke all on function public.get_seal_version(uuid, uuid), public.get_seal_state(uuid, uuid),
  public.record_seal_intent(uuid, uuid, bytea, text, bytea, text, timestamptz, timestamptz, text, text, text),
  public.record_seal_outcome(uuid, uuid, bigint, text, jsonb, text),
  public.record_seal_registration(uuid, uuid, bigint, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_seal_version(uuid, uuid), public.get_seal_state(uuid, uuid),
  public.record_seal_intent(uuid, uuid, bytea, text, bytea, text, timestamptz, timestamptz, text, text, text),
  public.record_seal_outcome(uuid, uuid, bigint, text, jsonb, text),
  public.record_seal_registration(uuid, uuid, bigint, text, text, text, text, text, text, text)
  to galcoa_executor;
reset role;
revoke create on schema public, private from galcoa_seal_writer;
grant galcoa_seal_writer to postgres with set false, inherit false;
