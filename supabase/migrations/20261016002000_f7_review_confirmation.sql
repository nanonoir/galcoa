-- F7 (MVP-070…076): revisión congelada, confirmación del autor, invitaciones,
-- respuesta atómica del tercero, estado agregado y contador de abuso. Aditiva:
-- no cambia guardas C1–C4 ni F4. Orden de locks: documento → revisión → solicitud.
--
-- Las funciones son SECURITY DEFINER con `search_path` vacío y pertenecen a un
-- rol sin login, sin bypass de RLS y con grants mínimos (mismo modelo que F4).
-- El actor del propietario es siempre `auth.uid()`; el tercero se identifica
-- solo por la capacidad (hash del token) y nunca recibe identidad de usuario.
-- El token en claro no existe en la base: solo su SHA-256, que además se trata
-- como capacidad y no se devuelve en ninguna función.

create role galcoa_f7_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_f7_writer;
grant execute on function private.f4_actor(), private.role_rank(text) to galcoa_f7_writer;

-- Lectura y escritura mínimas por tabla ---------------------------------------------------
grant select on public.documents, public.drafts, public.verification_reports, public.evidence_extractions,
  public.document_revisions, public.revision_snapshots, public.revision_participants,
  public.corroboration_requests, public.corroboration_responses, public.idempotency_records to galcoa_f7_writer;
grant update (active_revision_id, document_status, control_status, revision_seq, updated_at) on public.documents to galcoa_f7_writer;
grant insert on public.document_revisions, public.revision_snapshots, public.revision_participants,
  public.snapshot_sources, public.corroboration_requests, public.corroboration_responses,
  public.audit_events, public.idempotency_records to galcoa_f7_writer;
grant update (lifecycle, confirmation_status) on public.document_revisions to galcoa_f7_writer;
grant update (revoked_at, consumed_at) on public.corroboration_requests to galcoa_f7_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_f7_writer;

create policy f7_documents on public.documents to galcoa_f7_writer using (true) with check (true);
create policy f7_drafts on public.drafts for select to galcoa_f7_writer using (true);
create policy f7_reports on public.verification_reports for select to galcoa_f7_writer using (true);
create policy f7_extractions on public.evidence_extractions for select to galcoa_f7_writer using (true);
create policy f7_revisions on public.document_revisions to galcoa_f7_writer using (true) with check (true);
create policy f7_snapshots on public.revision_snapshots to galcoa_f7_writer using (true) with check (true);
create policy f7_participants on public.revision_participants to galcoa_f7_writer using (true) with check (true);
create policy f7_sources on public.snapshot_sources for insert to galcoa_f7_writer with check (true);
create policy f7_requests on public.corroboration_requests to galcoa_f7_writer using (true) with check (true);
create policy f7_responses on public.corroboration_responses to galcoa_f7_writer using (true) with check (true);
create policy f7_audit on public.audit_events for insert to galcoa_f7_writer with check (true);
create policy f7_idempotency on public.idempotency_records to galcoa_f7_writer using (true) with check (true);

-- El conjunto de participantes se verifica al commit (trigger diferido): en ese momento corre con el rol
-- de la sesión (`authenticated`/`anon`), que no tiene acceso a las tablas ni a `private.role_rank`. La
-- función solo lee y valida; con privilegios de su propietario no concede nada al llamador.
alter function private.check_revision_participants() security definer;

-- Contador de abuso (ventana fija; solo hashes de origen, nunca token ni IP) -----------------
create table public.rate_limit_counters (
  kind text not null check (kind in ('read', 'write')),
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  window_start bigint not null check (window_start >= 0),
  hits integer not null default 0 check (hits >= 0),
  primary key (kind, origin_hash, window_start)
);
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.rate_limit_counters to galcoa_f7_writer;
create policy f7_rate_limit on public.rate_limit_counters to galcoa_f7_writer using (true) with check (true);

-- Ayudantes privados ----------------------------------------------------------------------
create function private.f7_ts(t timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- Mismo cálculo que el motor puro de `src/lib/rules/dimensions.ts` (paridad probada).
create function private.f7_aggregate(p_revision uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when r.lifecycle = 'sustituida' then 'sustituida'
    when exists (select 1 from public.corroboration_responses x where x.revision_id = r.id and x.decision = 'rechazada') then 'rechazada'
    when (select count(*) from public.corroboration_responses x where x.revision_id = r.id and x.decision = 'confirmada') = cardinality(r.selection) then 'completa'
    when not exists (select 1 from public.corroboration_responses x where x.revision_id = r.id) then 'pendiente'
    else 'parcial' end
  from public.document_revisions r where r.id = p_revision
$$;

create function private.f7_revision_json(r public.document_revisions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'revisionId', r.id, 'documentId', r.document_id, 'snapshotId', r.snapshot_id,
    'snapshotHash', r.snapshot_hash, 'selection', to_jsonb(r.selection),
    'frozenFromDraftRevision', r.frozen_from_draft_revision, 'supersedesRevisionId', r.supersedes_revision_id,
    'documentStatus', (select d.document_status from public.documents d where d.id = r.document_id),
    'controlStatus', r.control_status, 'confirmationStatus', r.confirmation_status,
    'createdAt', private.f7_ts(r.created_at))
$$;

create function private.f7_bundle_json(p_revision uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'revision', private.f7_revision_json(r),
    'snapshot', jsonb_build_object('schemaVersion', 1, 'snapshotId', s.id, 'revisionId', r.id, 'documentId', r.document_id,
      'content', s.content, 'snapshotHash', s.snapshot_hash, 'frozenAt', private.f7_ts(s.frozen_at)))
  from public.document_revisions r join public.revision_snapshots s on s.revision_id = r.id
  where r.id = p_revision
$$;

-- Estado de una invitación: la consumida y la sustituida mandan sobre la revocada y la vencida.
create function private.f7_request_state(q public.corroboration_requests, r public.document_revisions) returns text
language sql stable set search_path = '' as $$
  select case
    when q.consumed_at is not null then 'consumida'
    when r.lifecycle <> 'activa' then 'sustituida'
    when q.revoked_at is not null then 'revocada'
    when clock_timestamp() >= q.expires_at then 'vencida'
    else 'vigente' end
$$;

-- Respuestas vigentes de una revisión + selección (para el agregado de TypeScript).
create function private.f7_responses_json(p_revision uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'role', x.role, 'response', case x.decision when 'confirmada' then 'confirmado' else 'rechazado' end,
    'snapshotId', x.snapshot_id, 'respondedAt', private.f7_ts(x.responded_at)) order by private.role_rank(x.role)), '[]'::jsonb)
  from public.corroboration_responses x where x.revision_id = p_revision
$$;

create function private.f7_response_json(x public.corroboration_responses, replayed boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', case when replayed then 'replayed' else 'created' end,
    'response', jsonb_build_object('responseId', x.id, 'revisionId', x.revision_id, 'snapshotId', x.snapshot_id,
      'snapshotHash', x.snapshot_hash, 'role', x.role, 'decision', case x.decision when 'confirmada' then 'confirmar' else 'rechazar' end,
      'declaredName', x.declared_name, 'respondedAt', private.f7_ts(x.responded_at)),
    'selection', (select to_jsonb(r.selection) from public.document_revisions r where r.id = x.revision_id),
    'responses', private.f7_responses_json(x.revision_id),
    'snapshotId', x.snapshot_id)
$$;

create function private.f7_valid_idempotency(p_key text, p_fingerprint text, p_correlation text) returns boolean
language sql immutable set search_path = '' as $$
  select p_key ~ '^[A-Za-z0-9_-]{8,128}$' and p_fingerprint ~ '^[0-9a-f]{64}$'
    and p_correlation is not null and char_length(p_correlation) between 1 and 128
$$;

-- #18 · Fuente del congelado (borrador vigente + último reporte de esa revisión) -------------
create function public.get_freeze_source(p_document_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); dr public.drafts; rep public.verification_reports; refs jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  perform 1 from public.documents where id = p_document_id and owner_id = actor;
  if not found then return null; end if;
  select * into dr from public.drafts where document_id = p_document_id;
  if not found then return null; end if;
  select * into rep from public.verification_reports
    where document_id = p_document_id and output->>'draftRevision' = dr.draft_revision::text
    order by created_at desc, id desc limit 1;
  -- Refs del reporte → fuente real (mensaje o evidencia); una extracción se resuelve a su evidencia.
  select coalesce(jsonb_agg(jsonb_build_object('ref', i->>'ref', 'kind', case when i->>'kind' = 'mensaje' then 'mensaje' else 'evidencia' end,
      'id', case when i->>'kind' = 'mensaje' then i->>'id'
                 else (select e.evidence_id::text from public.evidence_extractions e where e.id = (i->>'id')::uuid and e.document_id = p_document_id) end)
      ) filter (where i->>'kind' in ('mensaje', 'extraccion')), '[]'::jsonb)
    into refs
    from jsonb_array_elements(case when rep.id is null then '[]'::jsonb else coalesce(rep.input->'inputs', '[]'::jsonb) end) i;
  return jsonb_build_object(
    'draft', jsonb_build_object('draftId', dr.id, 'documentId', dr.document_id, 'draftRevision', dr.draft_revision,
      'content', dr.content, 'updatedAt', private.f7_ts(dr.updated_at)),
    'report', case when rep.id is null then null else jsonb_build_object('result', rep.output->'result', 'findings', coalesce(rep.output->'findings', '[]'::jsonb)) end,
    'refs', refs);
end
$$;

-- #18 · Congelar (MVP-070) -----------------------------------------------------------------
create function public.freeze_revision(
  p_document_id uuid, p_expected_draft_revision integer, p_canonical_hex text, p_control_status text,
  p_sources jsonb, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; dr public.drafts; cur public.document_revisions;
  rev public.document_revisions; prior public.idempotency_records;
  bytes bytea; content jsonb; hash text; sel text[]; rid uuid := gen_random_uuid(); sid uuid := gen_random_uuid();
  role_name text; src jsonb; invalidated integer := 0; seq integer;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_expected_draft_revision is null or p_expected_draft_revision < 0
     or p_canonical_hex is null or p_canonical_hex !~ '^([0-9a-f]{2})+$' or char_length(p_canonical_hex) > 524288
     or p_control_status is null or p_control_status not in ('sin_evaluar', 'con_advertencias', 'contradiccion_critica', 'sin_inconsistencias_criticas_detectadas')
     or p_sources is null or jsonb_typeof(p_sources) <> 'array'
     or not private.f7_valid_idempotency(p_key, p_fingerprint, p_correlation_id) then
    raise invalid_parameter_value;
  end if;
  select * into d from public.documents where id = p_document_id and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into prior from public.idempotency_records
    where actor_scope = actor::text and resource_id = p_document_id and action = 'revision.freeze' and key = p_key;
  if found then
    if prior.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    return jsonb_build_object('status', 'replayed', 'value', private.f7_bundle_json((prior.result->>'revisionId')::uuid));
  end if;
  if d.document_status = 'finalizado' then return jsonb_build_object('status', 'not_available'); end if;
  select * into dr from public.drafts where document_id = p_document_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if dr.draft_revision <> p_expected_draft_revision then return jsonb_build_object('status', 'stale_draft'); end if;

  bytes := decode(p_canonical_hex, 'hex');
  content := convert_from(bytes, 'UTF8')::jsonb;
  hash := encode(sha256(bytes), 'hex');
  -- El contenido compartido es exactamente la operación del borrador vigente + advertencias + selección.
  if jsonb_typeof(content) <> 'object' or (content - 'operation' - 'warnings' - 'selection') <> '{}'::jsonb
     or not (content ? 'operation' and content ? 'warnings' and content ? 'selection')
     or jsonb_typeof(content->'warnings') <> 'array' or jsonb_typeof(content->'selection') <> 'array'
     or content->'operation' is distinct from dr.content then
    raise invalid_parameter_value;
  end if;
  sel := array(select jsonb_array_elements_text(content->'selection'));

  if d.active_revision_id is not null then
    select * into cur from public.document_revisions where id = d.active_revision_id for update;
    if cur.snapshot_hash = hash and cur.lifecycle = 'activa' then
      insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
        values(actor::text, p_document_id, 'revision.freeze', p_key, p_fingerprint, jsonb_build_object('revisionId', cur.id));
      return jsonb_build_object('status', 'unchanged', 'value', private.f7_bundle_json(cur.id));
    end if;
  end if;

  update public.documents set revision_seq = revision_seq + 1, updated_at = clock_timestamp()
    where id = p_document_id returning revision_seq into seq;
  -- Referencias circulares diferidas: revisión y snapshot se verifican al commit.
  insert into public.document_revisions(id, document_id, sequence, snapshot_id, snapshot_hash, selection,
      frozen_from_draft_revision, supersedes_revision_id, control_status)
    values(rid, p_document_id, seq, sid, hash, sel, p_expected_draft_revision, cur.id, p_control_status);
  insert into public.revision_snapshots(id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
    values(sid, p_document_id, rid, 1, bytes, hash, content);
  foreach role_name in array sel loop
    insert into public.revision_participants(document_id, revision_id, snapshot_id, snapshot_hash, role, user_id)
      values(p_document_id, rid, sid, hash, role_name, case when role_name = 'autor' then actor end);
  end loop;
  for src in select * from jsonb_array_elements(p_sources) loop
    insert into public.snapshot_sources(document_id, snapshot_id, revision_id, snapshot_hash, alias, message_id, evidence_id)
      values(p_document_id, sid, rid, hash, src->>'alias',
        case when src->>'kind' = 'mensaje' then (src->>'id')::uuid end,
        case when src->>'kind' = 'evidencia' then (src->>'id')::uuid end);
  end loop;
  if cur.id is not null then
    update public.document_revisions set lifecycle = 'sustituida', confirmation_status = 'sustituida' where id = cur.id;
    update public.corroboration_requests set revoked_at = clock_timestamp()
      where revision_id = cur.id and revoked_at is null and consumed_at is null;
    get diagnostics invalidated = row_count;
  end if;
  update public.documents set active_revision_id = rid, document_status = 'esperando_confirmaciones',
    control_status = p_control_status, updated_at = clock_timestamp() where id = p_document_id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, actor::text, 'revision.frozen', 'revision', rid, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, p_document_id, 'revision.freeze', p_key, p_fingerprint, jsonb_build_object('revisionId', rid));
  return jsonb_build_object('status', 'created', 'value', private.f7_bundle_json(rid),
    'supersededRevisionId', cur.id, 'invalidatedInvitations', invalidated);
end
$$;

create function public.get_active_revision(p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.f7_bundle_json(d.active_revision_id)
  from public.documents d where d.id = p_document_id and d.owner_id = private.f4_actor() and d.active_revision_id is not null
$$;

-- #18 · Confirmación del autor (MVP-071) ----------------------------------------------------
create function public.confirm_as_author(
  p_revision_id uuid, p_snapshot_id uuid, p_snapshot_hash text, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; rev public.document_revisions; prior public.idempotency_records;
  part public.revision_participants; resp public.corroboration_responses; new_status text; doc uuid;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_revision_id is null or p_snapshot_id is null or p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or not private.f7_valid_idempotency(p_key, p_fingerprint, p_correlation_id) then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.document_revisions where id = p_revision_id;
  select * into d from public.documents where id = doc and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into rev from public.document_revisions where id = p_revision_id for update;
  select * into prior from public.idempotency_records
    where actor_scope = actor::text and resource_id = p_revision_id and action = 'confirmation.author' and key = p_key;
  if found then
    if prior.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    select * into resp from public.corroboration_responses where id = (prior.result->>'responseId')::uuid;
    return private.f7_response_json(resp, true);
  end if;
  if rev.lifecycle <> 'activa' or d.active_revision_id <> rev.id then return jsonb_build_object('status', 'revision_not_active'); end if;
  if p_snapshot_id <> rev.snapshot_id or p_snapshot_hash <> rev.snapshot_hash then return jsonb_build_object('status', 'snapshot_mismatch'); end if;
  select * into part from public.revision_participants where revision_id = rev.id and role = 'autor';
  if exists (select 1 from public.corroboration_responses where revision_id = rev.id and participant_id = part.id) then
    return jsonb_build_object('status', 'already_responded');
  end if;
  insert into public.corroboration_responses(document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, decision,
      checkbox_checked, ratified_rejection)
    values(rev.document_id, rev.id, rev.snapshot_id, rev.snapshot_hash, part.id, 'autor', 'confirmada', true, false)
    returning * into resp;
  new_status := private.f7_aggregate(rev.id);
  update public.document_revisions set confirmation_status = new_status where id = rev.id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(rev.document_id, actor::text, 'confirmation.author', 'response', resp.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, p_revision_id, 'confirmation.author', p_key, p_fingerprint, jsonb_build_object('responseId', resp.id));
  return private.f7_response_json(resp, false);
end
$$;

-- #20 · Estado de la revisión para el autor (MVP-075) -----------------------------------------
create function public.get_revision_state(p_revision_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('revisionId', r.id, 'snapshotId', r.snapshot_id, 'documentId', r.document_id,
    'selection', to_jsonb(r.selection), 'superseded', r.lifecycle = 'sustituida',
    'responses', private.f7_responses_json(r.id))
  from public.document_revisions r join public.documents d on d.id = r.document_id
  where r.id = p_revision_id and d.owner_id = private.f4_actor()
$$;

-- #19 · Invitaciones (MVP-072) ---------------------------------------------------------------
create function public.issue_invitation(
  p_revision_id uuid, p_role text, p_token_hash text, p_ttl_seconds integer, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; rev public.document_revisions; prior public.idempotency_records;
  part public.revision_participants; prev public.corroboration_requests; req public.corroboration_requests; doc uuid; gen integer;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_revision_id is null or p_role is null or p_role not in ('intermediario', 'comprador')
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ttl_seconds is null or p_ttl_seconds not between 60 and 604800
     or not private.f7_valid_idempotency(p_key, p_fingerprint, p_correlation_id) then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.document_revisions where id = p_revision_id;
  select * into d from public.documents where id = doc and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into rev from public.document_revisions where id = p_revision_id for update;
  select * into prior from public.idempotency_records
    where actor_scope = actor::text and resource_id = p_revision_id and action = 'invitation.issue' and key = p_key;
  if found then
    if prior.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    return jsonb_build_object('status', 'replayed', 'invitationId', prior.result->>'invitationId');
  end if;
  if rev.lifecycle <> 'activa' or d.active_revision_id <> rev.id then return jsonb_build_object('status', 'revision_not_active'); end if;
  select * into part from public.revision_participants where revision_id = rev.id and role = p_role;
  if not found then return jsonb_build_object('status', 'role_not_selected'); end if;
  if exists (select 1 from public.corroboration_responses where participant_id = part.id) then
    return jsonb_build_object('status', 'already_responded');
  end if;
  select * into prev from public.corroboration_requests where participant_id = part.id and revoked_at is null for update;
  if found then update public.corroboration_requests set revoked_at = clock_timestamp() where id = prev.id; end if;
  select coalesce(max(generation), 0) + 1 into gen from public.corroboration_requests where participant_id = part.id;
  insert into public.corroboration_requests(document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, token_hash, generation, expires_at)
    values(rev.document_id, rev.id, rev.snapshot_id, rev.snapshot_hash, part.id, p_role, p_token_hash, gen, clock_timestamp() + make_interval(secs => p_ttl_seconds))
    returning * into req;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(rev.document_id, actor::text, 'invitation.issued', 'request', req.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, p_revision_id, 'invitation.issue', p_key, p_fingerprint, jsonb_build_object('invitationId', req.id));
  return jsonb_build_object('status', 'created', 'invitationId', req.id, 'revisionId', rev.id, 'role', p_role,
    'expiresAt', private.f7_ts(req.expires_at), 'revokedInvitationId', prev.id);
end
$$;

create function public.revoke_invitation(p_invitation_id uuid, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); q public.corroboration_requests; d public.documents; rev public.document_revisions;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then raise invalid_parameter_value; end if;
  select * into q from public.corroboration_requests where id = p_invitation_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into d from public.documents where id = q.document_id and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into rev from public.document_revisions where id = q.revision_id for update;
  select * into q from public.corroboration_requests where id = p_invitation_id for update;
  if q.revoked_at is not null then return jsonb_build_object('status', 'already_revoked'); end if;
  if q.consumed_at is null then
    update public.corroboration_requests set revoked_at = clock_timestamp() where id = q.id;
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(q.document_id, actor::text, 'invitation.revoked', 'request', q.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  end if;
  return jsonb_build_object('status', 'revoked');
end
$$;

-- #19 · Lectura pública sin consumo (MVP-073) -----------------------------------------------
create function public.read_invitation(p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invitationId', q.id, 'revisionId', r.id, 'snapshotId', r.snapshot_id, 'snapshotHash', r.snapshot_hash,
    'role', q.role, 'selection', to_jsonb(r.selection), 'content', s.content,
    'state', private.f7_request_state(q, r), 'expiresAt', private.f7_ts(q.expires_at))
  from public.corroboration_requests q
  join public.document_revisions r on r.id = q.revision_id
  join public.revision_snapshots s on s.revision_id = r.id
  where p_token_hash ~ '^[0-9a-f]{64}$' and q.token_hash = p_token_hash
$$;

-- #19 · Respuesta atómica del tercero (MVP-074) ---------------------------------------------
create function public.respond_invitation(
  p_token_hash text, p_revision_id uuid, p_snapshot_id uuid, p_snapshot_hash text, p_decision text,
  p_declared_name text, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q public.corroboration_requests; rev public.document_revisions; d public.documents; prior public.idempotency_records;
  resp public.corroboration_responses; state text; new_status text; scope text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_decision is null or p_decision not in ('confirmar', 'rechazar')
     or p_declared_name is null or char_length(btrim(p_declared_name)) not between 1 and 200
     or p_revision_id is null or p_snapshot_id is null or p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or not private.f7_valid_idempotency(p_key, p_fingerprint, p_correlation_id) then
    raise invalid_parameter_value;
  end if;
  select * into q from public.corroboration_requests where token_hash = p_token_hash;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  -- Orden de locks: documento → revisión → solicitud.
  select * into d from public.documents where id = q.document_id for update;
  select * into rev from public.document_revisions where id = q.revision_id for update;
  select * into q from public.corroboration_requests where id = q.id for update;
  scope := 'capability:' || q.id::text;
  select * into prior from public.idempotency_records
    where actor_scope = scope and resource_id = q.id and action = 'confirmation.third_party' and key = p_key;
  if found then
    if prior.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'idempotency_conflict'); end if;
    select * into resp from public.corroboration_responses where id = (prior.result->>'responseId')::uuid;
    return private.f7_response_json(resp, true);
  end if;
  state := private.f7_request_state(q, rev);
  if state <> 'vigente' then return jsonb_build_object('status', 'unavailable', 'state', state); end if;
  if p_revision_id <> rev.id or p_snapshot_id <> rev.snapshot_id or p_snapshot_hash <> rev.snapshot_hash then
    return jsonb_build_object('status', 'snapshot_mismatch');
  end if;
  insert into public.corroboration_responses(document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, request_id,
      decision, checkbox_checked, ratified_rejection, declared_name)
    values(rev.document_id, rev.id, rev.snapshot_id, rev.snapshot_hash, q.participant_id, q.role, q.id,
      case p_decision when 'confirmar' then 'confirmada' else 'rechazada' end, p_decision = 'confirmar', p_decision = 'rechazar', btrim(p_declared_name))
    returning * into resp;
  update public.corroboration_requests set consumed_at = clock_timestamp() where id = q.id;
  new_status := private.f7_aggregate(rev.id);
  update public.document_revisions set confirmation_status = new_status where id = rev.id;
  if new_status = 'rechazada' then
    update public.documents set document_status = 'revision_rechazada', updated_at = clock_timestamp() where id = rev.document_id;
  end if;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(rev.document_id, scope, 'confirmation.third_party', 'response', resp.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(scope, q.id, 'confirmation.third_party', p_key, p_fingerprint, jsonb_build_object('responseId', resp.id));
  return private.f7_response_json(resp, false);
end
$$;

-- #20 · Límite de abuso (MVP-075) --------------------------------------------------------------
create function public.hit_rate_limit(p_kind text, p_origin_hash text, p_window_start bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if p_kind is null or p_kind not in ('read', 'write') or p_origin_hash is null or p_origin_hash !~ '^[0-9a-f]{64}$'
     or p_window_start is null or p_window_start < 0 then
    raise invalid_parameter_value;
  end if;
  delete from public.rate_limit_counters where window_start < p_window_start - 3600;
  insert into public.rate_limit_counters(kind, origin_hash, window_start, hits) values(p_kind, p_origin_hash, p_window_start, 1)
    on conflict (kind, origin_hash, window_start) do update set hits = public.rate_limit_counters.hits + 1
    returning hits into total;
  return total;
end
$$;

-- Propiedad y permisos de ejecución (mismo mecanismo que F4) ----------------------------------
grant create on schema public, private to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function private.f7_ts(timestamptz) owner to galcoa_f7_writer;
alter function private.f7_aggregate(uuid) owner to galcoa_f7_writer;
alter function private.f7_revision_json(public.document_revisions) owner to galcoa_f7_writer;
alter function private.f7_bundle_json(uuid) owner to galcoa_f7_writer;
alter function private.f7_request_state(public.corroboration_requests, public.document_revisions) owner to galcoa_f7_writer;
alter function private.f7_responses_json(uuid) owner to galcoa_f7_writer;
alter function private.f7_response_json(public.corroboration_responses, boolean) owner to galcoa_f7_writer;
alter function private.f7_valid_idempotency(text, text, text) owner to galcoa_f7_writer;
alter function public.get_freeze_source(uuid) owner to galcoa_f7_writer;
alter function public.freeze_revision(uuid, integer, text, text, jsonb, text, text, text) owner to galcoa_f7_writer;
alter function public.get_active_revision(uuid) owner to galcoa_f7_writer;
alter function public.confirm_as_author(uuid, uuid, text, text, text, text) owner to galcoa_f7_writer;
alter function public.get_revision_state(uuid) owner to galcoa_f7_writer;
alter function public.issue_invitation(uuid, text, text, integer, text, text, text) owner to galcoa_f7_writer;
alter function public.revoke_invitation(uuid, text) owner to galcoa_f7_writer;
alter function public.read_invitation(text) owner to galcoa_f7_writer;
alter function public.respond_invitation(text, uuid, uuid, text, text, text, text, text, text) owner to galcoa_f7_writer;
alter function public.hit_rate_limit(text, text, bigint) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function private.f7_ts(timestamptz), private.f7_aggregate(uuid), private.f7_revision_json(public.document_revisions),
  private.f7_bundle_json(uuid), private.f7_request_state(public.corroboration_requests, public.document_revisions),
  private.f7_responses_json(uuid), private.f7_response_json(public.corroboration_responses, boolean),
  private.f7_valid_idempotency(text, text, text) from public, anon, authenticated, service_role, galcoa_executor;
revoke all on function public.get_freeze_source(uuid), public.freeze_revision(uuid, integer, text, text, jsonb, text, text, text),
  public.get_active_revision(uuid), public.confirm_as_author(uuid, uuid, text, text, text, text), public.get_revision_state(uuid),
  public.issue_invitation(uuid, text, text, integer, text, text, text), public.revoke_invitation(uuid, text),
  public.read_invitation(text), public.respond_invitation(text, uuid, uuid, text, text, text, text, text, text),
  public.hit_rate_limit(text, text, bigint) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_freeze_source(uuid), public.freeze_revision(uuid, integer, text, text, jsonb, text, text, text),
  public.get_active_revision(uuid), public.confirm_as_author(uuid, uuid, text, text, text, text), public.get_revision_state(uuid),
  public.issue_invitation(uuid, text, text, integer, text, text, text), public.revoke_invitation(uuid, text) to authenticated;
-- Capacidad pública: solo lectura sin consumo, respuesta y contador. El token llega como hash.
grant execute on function public.read_invitation(text), public.respond_invitation(text, uuid, uuid, text, text, text, text, text, text),
  public.hit_rate_limit(text, text, bigint) to anon, authenticated;
reset role;
revoke create on schema public, private from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
