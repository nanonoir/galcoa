-- Turnos de chat durables, checkpoint 2 (docs/design/durable-chat-turns.md; MVP-052).
-- Staging de la propuesta por intento y publicación atómica (borrador + historial + mensaje
-- del agente + cierre + auditoría en un único commit). Aditiva sobre 02500.
-- El staging vive en columnas de `chat_turns`: no hay tabla de borrador duplicada y
-- `public.drafts` (una fila por documento) solo se escribe en `complete_chat_turn`.
-- Recuperar un lease (attempt + 1) o cerrar el turno como fallido/cancelado limpia el staging.
-- Orden de locks: documento → borrador (si existe) → turno. Ninguna llamada externa bajo locks.
-- Historial: `verification_reports` con `kind = 'redaccion'` (versión 1). NO lleva `draftRevision`
-- ni `result` en la raíz de `output`, por lo que `get_freeze_source` (F7) no lo toma por un
-- reporte de contraste. Esa función aún no discrimina tipos de reporte: debe corregirse (etapa B,
-- contraste) antes de montar cualquier ruta que publique con este flujo.
-- Pendiente de coordinar con F8: finalizar debe exigir que la revisión activa provenga del
-- borrador vigente (`frozen_from_draft_revision`); publicar un borrador nuevo no toca revisiones
-- congeladas ni el estado del documento, pero tampoco habilita finalizar sin congelar de nuevo.

alter table public.chat_turns
  add column staged_proposal_id uuid,
  add column staged_draft_id uuid,
  add column staged_expected_revision integer check (staged_expected_revision >= 0),
  add column staged_fingerprint text check (staged_fingerprint ~ '^[0-9a-f]{64}$'),
  add column staged_payload jsonb check (jsonb_typeof(staged_payload) = 'object'),
  -- Resultado original publicado; el replay devuelve este, no el borrador vigente.
  add column completion_result jsonb check (jsonb_typeof(completion_result) = 'object'),
  add constraint chat_turns_staging_all_or_none check (
    num_nulls(staged_proposal_id, staged_draft_id, staged_expected_revision, staged_fingerprint, staged_payload) in (0, 5)),
  add constraint chat_turns_completion_only_completed check (completion_result is null or state = 'completado');

create function private.chat_turns_stage_reset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.attempt <> old.attempt or new.state in ('fallido', 'cancelado') then
    new.staged_proposal_id := null; new.staged_draft_id := null; new.staged_expected_revision := null;
    new.staged_fingerprint := null; new.staged_payload := null;
  end if;
  return new;
end
$$;
revoke all on function private.chat_turns_stage_reset() from public, anon, authenticated, service_role, galcoa_executor;
create trigger trg_chat_turns_stage_reset before update on public.chat_turns
  for each row execute function private.chat_turns_stage_reset();

-- Permisos mínimos adicionales del rol propietario.
grant update (agent_message_id, staged_proposal_id, staged_draft_id, staged_expected_revision, staged_fingerprint,
  staged_payload, completion_result) on public.chat_turns to galcoa_turn_writer;
grant select, insert on public.drafts to galcoa_turn_writer;
grant update (draft_revision, content, source_refs, updated_at) on public.drafts to galcoa_turn_writer;
grant insert on public.verification_reports, public.report_sources to galcoa_turn_writer;
grant select on public.evidences, public.evidence_extractions to galcoa_turn_writer;
create policy turn_writer_drafts on public.drafts to galcoa_turn_writer using (true) with check (true);
create policy turn_writer_reports_insert on public.verification_reports for insert to galcoa_turn_writer with check (true);
create policy turn_writer_sources_insert on public.report_sources for insert to galcoa_turn_writer with check (true);
create policy turn_writer_evidences_read on public.evidences for select to galcoa_turn_writer using (true);
create policy turn_writer_extractions_read on public.evidence_extractions for select to galcoa_turn_writer using (true);

-- El mensaje del agente se persiste con la RPC existente de F4 (EXECUTE exacto, sin INSERT directo).
grant galcoa_f4_writer to postgres with set true;
set local role galcoa_f4_writer;
grant execute on function public.append_agent_message(uuid, uuid, text, jsonb, text, text) to galcoa_turn_writer;
reset role;
grant galcoa_f4_writer to postgres with set false, inherit false;

-- Guarda la propuesta del intento vigente sin tocar el borrador oficial. Repetición exacta: mismo
-- resultado; otro contenido para el mismo turno: `stage_conflict`.
create function public.stage_chat_turn_proposal(p_actor_id uuid, p_turn_id uuid, p_attempt integer, p_expected_draft_revision integer,
  p_content jsonb, p_proposal jsonb, p_inputs jsonb, p_model_id text, p_prompt_version text, p_limitations jsonb, p_correlation_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.chat_turns; doc uuid; head integer; fp text; draft_id uuid; was_staged boolean := false;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  -- Forma (sin acceso a datos): igual que OperationContent / DraftInputRef de los puertos.
  if p_attempt is null or p_attempt < 1 or p_expected_draft_revision is null or p_expected_draft_revision < 0
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128
     or p_model_id is null or char_length(p_model_id) not between 1 and 200
     or p_prompt_version is null or char_length(p_prompt_version) not between 1 and 100
     or jsonb_typeof(p_content) is distinct from 'object' or (p_content - 'title' - 'body' - 'corrections') <> '{}'::jsonb
     or jsonb_typeof(p_content->'title') is distinct from 'string' or jsonb_typeof(p_content->'body') is distinct from 'string'
     or jsonb_typeof(p_content->'corrections') is distinct from 'array'
     or char_length(btrim(p_content->>'title')) not between 1 and 500 or char_length(btrim(p_content->>'body')) not between 1 and 50000
     or jsonb_array_length(p_content->'corrections') > 200
     or exists (select 1 from jsonb_array_elements(p_content->'corrections') c
                where jsonb_typeof(c) is distinct from 'string' or char_length(btrim(c #>> '{}')) not between 1 and 1000)
     or jsonb_typeof(p_proposal) is distinct from 'object' or octet_length(p_proposal::text) > 262144
     or jsonb_typeof(p_limitations) is distinct from 'array' or jsonb_array_length(p_limitations) > 50
     or exists (select 1 from jsonb_array_elements(p_limitations) l
                where jsonb_typeof(l) is distinct from 'string' or char_length(btrim(l #>> '{}')) not between 1 and 1000)
     or jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs) not between 1 and 400
     or exists (select 1 from jsonb_array_elements(p_inputs) i
                where jsonb_typeof(i) is distinct from 'object' or (i - 'ref' - 'kind' - 'id') <> '{}'::jsonb
                   or coalesce(i->>'ref', '') !~ '^[me][0-9]{1,3}$'
                   or coalesce(i->>'kind', '') not in ('mensaje', 'extraccion')
                   or (i->>'kind' = 'mensaje') <> (left(i->>'ref', 1) = 'm')
                   or coalesce(i->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (select count(distinct i->>'ref') from jsonb_array_elements(p_inputs) i) <> jsonb_array_length(p_inputs) then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.chat_turns where id = p_turn_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into t from public.chat_turns where id = p_turn_id for update;
  if t.attempt is distinct from p_attempt or t.state <> 'en_curso' or t.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'stale');
  end if;
  if t.user_message_id is null then return jsonb_build_object('status', 'user_message_required'); end if;
  fp := encode(sha256(convert_to(jsonb_build_object('e', p_expected_draft_revision, 'c', p_content, 'p', p_proposal, 'i', p_inputs,
    'm', p_model_id, 'v', p_prompt_version, 'l', p_limitations)::text, 'UTF8')), 'hex');
  if t.staged_fingerprint is not null then
    if t.staged_fingerprint <> fp then return jsonb_build_object('status', 'stage_conflict'); end if;
    was_staged := true;
  else
    -- Fuentes del propio documento (mensajes y extracciones de evidencias aceptadas); nunca ids ajenos.
    if (select count(*) from jsonb_array_elements(p_inputs) i
        where (i->>'kind' = 'mensaje' and exists (select 1 from public.messages m
                 where m.id = (i->>'id')::uuid and m.document_id = doc))
           or (i->>'kind' = 'extraccion' and exists (select 1 from public.evidence_extractions x
                 join public.evidences e on e.id = x.evidence_id and e.document_id = x.document_id
                 where x.id = (i->>'id')::uuid and x.document_id = doc and e.upload_state = 'accepted'))) <> jsonb_array_length(p_inputs) then
      raise invalid_parameter_value;
    end if;
    select draft_revision, id into head, draft_id from public.drafts where document_id = doc;
    if not found then head := 0; end if;
    if head <> p_expected_draft_revision then return jsonb_build_object('status', 'stale_draft'); end if;
    update public.chat_turns set staged_proposal_id = gen_random_uuid(), staged_draft_id = coalesce(draft_id, gen_random_uuid()),
        staged_expected_revision = p_expected_draft_revision, staged_fingerprint = fp,
        staged_payload = jsonb_build_object('content', p_content, 'proposal', p_proposal, 'inputs', p_inputs, 'modelId', p_model_id,
          'promptVersion', p_prompt_version, 'limitations', p_limitations),
        updated_at = clock_timestamp()
      where id = t.id returning * into t;
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(doc, p_actor_id::text, 'chat_turn.staged', 'chat_turn', t.id, 'ok',
        jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'attempt', t.attempt,
          'expectedDraftRevision', t.staged_expected_revision, 'proposalId', t.staged_proposal_id));
  end if;
  return jsonb_build_object('status', 'staged', 'replayed', was_staged, 'turn', private.chat_turn_json(t),
    'staged', jsonb_build_object('proposalId', t.staged_proposal_id, 'draftId', t.staged_draft_id,
      'expectedDraftRevision', t.staged_expected_revision, 'nextDraftRevision', t.staged_expected_revision + 1));
end
$$;

-- Publica el turno: todo o nada. Los estados no exitosos (`stale`, `not_staged`, `stale_draft`, …)
-- no escriben nada. Un error inesperado aborta la transacción completa.
create function public.complete_chat_turn(p_actor_id uuid, p_turn_id uuid, p_attempt integer, p_agent_content text, p_correlation_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.chat_turns; d public.documents; dr public.drafts; doc uuid; has_draft boolean; msg jsonb; draft_json jsonb; result jsonb;
  new_rev integer; staged jsonb;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_attempt is null or p_attempt < 1 or p_agent_content is null or char_length(btrim(p_agent_content)) = 0
     or char_length(p_agent_content) > 8000 or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.chat_turns where id = p_turn_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into d from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into dr from public.drafts where document_id = doc for update;
  has_draft := found;
  select * into t from public.chat_turns where id = p_turn_id for update;

  if t.state = 'completado' then
    if t.attempt <> p_attempt or t.completion_result is null then return jsonb_build_object('status', 'stale'); end if;
    return t.completion_result || jsonb_build_object('status', 'replayed', 'turn', private.chat_turn_json(t));
  end if;
  if t.attempt <> p_attempt or t.state <> 'en_curso' or t.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'stale');
  end if;
  if t.staged_proposal_id is null then return jsonb_build_object('status', 'not_staged'); end if;
  if t.user_message_id is null or not exists (select 1 from public.messages
       where id = t.user_message_id and document_id = doc and sender = 'autor') then
    return jsonb_build_object('status', 'user_message_required');
  end if;
  if d.document_status = 'finalizado' then return jsonb_build_object('status', 'document_finalized'); end if;
  -- CAS: revisión esperada 0 significa «sin fila»; n ≥ 1, la fila exactamente en n.
  if (t.staged_expected_revision = 0 and has_draft) or (t.staged_expected_revision > 0 and (not has_draft or dr.draft_revision <> t.staged_expected_revision)) then
    return jsonb_build_object('status', 'stale_draft');
  end if;

  staged := t.staged_payload;
  new_rev := t.staged_expected_revision + 1;
  if has_draft then
    update public.drafts set draft_revision = new_rev, content = staged->'content',
        source_refs = (staged->'inputs') || jsonb_build_array(jsonb_build_object('kind', 'reporte', 'id', t.staged_proposal_id)),
        updated_at = clock_timestamp()
      where id = dr.id returning * into dr;
  else
    insert into public.drafts(id, document_id, draft_revision, content, source_refs, updated_at)
      values(t.staged_draft_id, doc, new_rev, staged->'content',
        (staged->'inputs') || jsonb_build_array(jsonb_build_object('kind', 'reporte', 'id', t.staged_proposal_id)), clock_timestamp())
      returning * into dr;
  end if;
  -- Historial: la propuesta exacta, sin `draftRevision`/`result` en la raíz (no es un contraste) y
  -- sin afirmar reglas ejecutadas; `rules_version` solo nombra el formato.
  insert into public.verification_reports(id, document_id, input, output, model, prompt_version, rules_version, limitations)
    values(t.staged_proposal_id, doc,
      jsonb_build_object('kind', 'redaccion', 'schemaVersion', 1, 'expectedDraftRevision', t.staged_expected_revision,
        'turnId', t.id, 'attempt', t.attempt, 'inputs', staged->'inputs'),
      jsonb_build_object('kind', 'redaccion', 'schemaVersion', 1, 'publishedDraftRevision', dr.draft_revision, 'proposal', staged->'proposal'),
      staged->>'modelId', staged->>'promptVersion', 'redaccion-v1', staged->'limitations');
  insert into public.report_sources(document_id, report_id, message_id, extraction_id)
    select doc, t.staged_proposal_id, case when i->>'kind' = 'mensaje' then (i->>'id')::uuid end,
        case when i->>'kind' = 'extraccion' then (i->>'id')::uuid end
      from jsonb_array_elements(staged->'inputs') i;

  msg := public.append_agent_message(p_actor_id, doc, p_agent_content, '{"kind":"unknown"}'::jsonb,
    'tc-' || encode(sha256(convert_to(t.id::text || ':agente', 'UTF8')), 'hex'), p_correlation_id);
  if msg->>'status' not in ('created', 'replayed') then
    raise exception 'chat_turns: mensaje del agente no persistido (%)', msg->>'status' using errcode = 'raise_exception';
  end if;

  draft_json := jsonb_build_object('draftId', dr.id, 'documentId', dr.document_id, 'draftRevision', dr.draft_revision,
    'content', dr.content, 'updatedAt', to_char(dr.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  result := jsonb_build_object('draft', draft_json, 'proposalId', t.staged_proposal_id, 'agentMessage', msg->'value');
  update public.chat_turns set state = 'completado', agent_message_id = (msg->'value'->>'messageId')::uuid, lease_expires_at = null,
      completion_result = result, staged_proposal_id = null, staged_draft_id = null, staged_expected_revision = null,
      staged_fingerprint = null, staged_payload = null, updated_at = clock_timestamp()
    where id = t.id returning * into t;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'chat_turn.completed', 'chat_turn', t.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'attempt', t.attempt,
        'draftRevision', dr.draft_revision, 'proposalId', result->>'proposalId', 'agentMessageId', t.agent_message_id));
  return result || jsonb_build_object('status', 'completed', 'turn', private.chat_turn_json(t));
end
$$;

-- Propiedad y permisos de ejecución (mismo mecanismo que 02500).
grant create on schema public, private to galcoa_turn_writer;
grant galcoa_turn_writer to postgres with set true;
alter function public.stage_chat_turn_proposal(uuid, uuid, integer, integer, jsonb, jsonb, jsonb, text, text, jsonb, text) owner to galcoa_turn_writer;
alter function public.complete_chat_turn(uuid, uuid, integer, text, text) owner to galcoa_turn_writer;
set local role galcoa_turn_writer;
revoke all on function public.stage_chat_turn_proposal(uuid, uuid, integer, integer, jsonb, jsonb, jsonb, text, text, jsonb, text),
  public.complete_chat_turn(uuid, uuid, integer, text, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.stage_chat_turn_proposal(uuid, uuid, integer, integer, jsonb, jsonb, jsonb, text, text, jsonb, text),
  public.complete_chat_turn(uuid, uuid, integer, text, text) to galcoa_executor;
reset role;
revoke create on schema public, private from galcoa_turn_writer;
grant galcoa_turn_writer to postgres with set false, inherit false;
