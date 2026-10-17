-- Persistencia del reporte de contraste del Agente 2 (docs/design/durable-chat-turns.md; MVP-053).
-- Aditiva sobre 02501. Reutiliza `verification_reports`/`report_sources` (append-only): no hay tabla nueva.
-- Formato versionado (`rules_version = 'contraste-v1'` nombra el formato, no afirma reglas ejecutadas):
--   input  = {kind:'contraste', schemaVersion:1, inputs:[{ref,kind,id}…], draft:{draftId,draftRevision,content}}
--   output = {kind:'contraste', schemaVersion:1, draftId, draftRevision, result, findings}
-- `inputs` conserva las entradas exactas (incluida `b1`, kind `borrador`); `report_sources` solo guarda
-- mensajes y extracciones (no soporta borradores y no se finge evidencia). El redactor (02501) usa
-- `kind = 'redaccion'` sin `draftRevision`/`result` en la raíz de `output`.
-- Orden de locks: documento → borrador. El CAS compara id, revisión y contenido de `b1` con el borrador
-- vigente ANTES de escribir; un resultado tardío no escribe nada. No toca estado del documento,
-- confirmaciones ni snapshots; las advertencias nunca vetan. Cada llamada exitosa crea otro reporte.
-- Pendiente (siguiente entrega): `get_freeze_source` debe discriminar `kind` y consolidar agentes y reglas.

create role galcoa_contrast_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_contrast_writer;
grant select on public.documents, public.drafts, public.messages, public.evidences, public.evidence_extractions to galcoa_contrast_writer;
-- Bloqueo `for update` de documento y borrador: exige UPDATE de al menos una columna. En `drafts`,
-- `drafts_guard` rechaza cualquier UPDATE que no aumente la revisión, y esta RPC nunca actualiza.
grant update (updated_at) on public.documents, public.drafts to galcoa_contrast_writer;
grant insert on public.verification_reports, public.report_sources, public.audit_events to galcoa_contrast_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_contrast_writer;
create policy contrast_writer_documents_read on public.documents for select to galcoa_contrast_writer using (true);
create policy contrast_writer_documents_lock on public.documents for update to galcoa_contrast_writer using (true) with check (true);
create policy contrast_writer_drafts_read on public.drafts for select to galcoa_contrast_writer using (true);
create policy contrast_writer_drafts_lock on public.drafts for update to galcoa_contrast_writer using (true) with check (true);
create policy contrast_writer_messages_read on public.messages for select to galcoa_contrast_writer using (true);
create policy contrast_writer_evidences_read on public.evidences for select to galcoa_contrast_writer using (true);
create policy contrast_writer_extractions_read on public.evidence_extractions for select to galcoa_contrast_writer using (true);
create policy contrast_writer_reports_insert on public.verification_reports for insert to galcoa_contrast_writer with check (true);
create policy contrast_writer_sources_insert on public.report_sources for insert to galcoa_contrast_writer with check (true);
create policy contrast_writer_audit_insert on public.audit_events for insert to galcoa_contrast_writer with check (true);

-- Estados: `created` (reportId, createdAt), `stale_draft`, `not_available` (ajeno o inexistente).
-- Forma o referencias inválidas: `invalid_parameter_value`; sin actor: `insufficient_privilege`.
create function public.persist_contrast_report(p_actor_id uuid, p_document_id uuid, p_draft_id uuid, p_draft_revision integer,
  p_draft_content jsonb, p_result text, p_findings jsonb, p_inputs jsonb, p_model_id text, p_prompt_version text,
  p_limitations jsonb, p_correlation_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dr public.drafts; rid uuid := gen_random_uuid(); created timestamptz; expected text;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  -- Forma (sin acceso a datos): igual que SaveReportInput y ContrastOutputSchema del servicio.
  if p_document_id is null or p_draft_id is null or p_draft_revision is null or p_draft_revision < 1
     or jsonb_typeof(p_draft_content) is distinct from 'object'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128
     or p_model_id is null or char_length(p_model_id) not between 1 and 200
     or p_prompt_version is null or char_length(p_prompt_version) not between 1 and 100
     or p_result is null or p_result not in ('sin_inconsistencias_criticas_detectadas', 'con_advertencias', 'contradiccion_critica')
     or jsonb_typeof(p_limitations) is distinct from 'array' or jsonb_array_length(p_limitations) > 50
     or exists (select 1 from jsonb_array_elements(p_limitations) l
                where jsonb_typeof(l) is distinct from 'string' or char_length(btrim(l #>> '{}')) not between 1 and 1000)
     or jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs) not between 1 and 401
     or exists (select 1 from jsonb_array_elements(p_inputs) i
                where jsonb_typeof(i) is distinct from 'object' or (i - 'ref' - 'kind' - 'id') <> '{}'::jsonb
                   or coalesce(i->>'ref', '') !~ '^[meb][0-9]{1,3}$'
                   or coalesce(i->>'kind', '') <> case left(coalesce(i->>'ref', ''), 1) when 'm' then 'mensaje' when 'e' then 'extraccion' else 'borrador' end
                   or coalesce(i->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (select count(distinct i->>'ref') from jsonb_array_elements(p_inputs) i) <> jsonb_array_length(p_inputs)
     -- Exactamente un borrador evaluado: `b1`, con el id del borrador recibido.
     or (select count(*) from jsonb_array_elements(p_inputs) i where i->>'kind' = 'borrador') <> 1
     or not exists (select 1 from jsonb_array_elements(p_inputs) i where i->>'ref' = 'b1' and i->>'id' = p_draft_id::text)
     or jsonb_typeof(p_findings) is distinct from 'array' or jsonb_array_length(p_findings) > 200
     or exists (select 1 from jsonb_array_elements(p_findings) f
                where jsonb_typeof(f) is distinct from 'object' or (f - 'message' - 'severity' - 'sourceRefs') <> '{}'::jsonb
                   or jsonb_typeof(f->'message') is distinct from 'string' or char_length(f->>'message') not between 1 and 4000
                   or coalesce(f->>'severity', '') not in ('warning', 'critical')
                   or jsonb_typeof(f->'sourceRefs') is distinct from 'array' or jsonb_array_length(f->'sourceRefs') not between 1 and 401
                   or exists (select 1 from jsonb_array_elements(f->'sourceRefs') r
                              where jsonb_typeof(r) is distinct from 'string'
                                 or not exists (select 1 from jsonb_array_elements(p_inputs) i where i->>'ref' = r #>> '{}'))) then
    raise invalid_parameter_value;
  end if;
  -- Resultado coherente con los hallazgos (misma regla determinista que el servicio).
  expected := case when exists (select 1 from jsonb_array_elements(p_findings) f where f->>'severity' = 'critical') then 'contradiccion_critica'
                   when jsonb_array_length(p_findings) > 0 then 'con_advertencias' else 'sin_inconsistencias_criticas_detectadas' end;
  if p_result <> expected then raise invalid_parameter_value; end if;

  perform 1 from public.documents where id = p_document_id and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into dr from public.drafts where document_id = p_document_id for update;
  if not found or dr.id <> p_draft_id or dr.draft_revision <> p_draft_revision or dr.content <> p_draft_content then
    return jsonb_build_object('status', 'stale_draft');
  end if;
  -- Fuentes del propio documento (mensajes y extracciones de evidencias aceptadas); nunca ids ajenos.
  if (select count(*) from jsonb_array_elements(p_inputs) i
      where (i->>'kind' = 'borrador')
         or (i->>'kind' = 'mensaje' and exists (select 1 from public.messages m
               where m.id = (i->>'id')::uuid and m.document_id = p_document_id))
         or (i->>'kind' = 'extraccion' and exists (select 1 from public.evidence_extractions x
               join public.evidences e on e.id = x.evidence_id and e.document_id = x.document_id
               where x.id = (i->>'id')::uuid and x.document_id = p_document_id and e.upload_state = 'accepted'))) <> jsonb_array_length(p_inputs) then
    raise invalid_parameter_value;
  end if;

  insert into public.verification_reports(id, document_id, input, output, model, prompt_version, rules_version, limitations)
    values(rid, p_document_id,
      jsonb_build_object('kind', 'contraste', 'schemaVersion', 1, 'inputs', p_inputs,
        'draft', jsonb_build_object('draftId', dr.id, 'draftRevision', dr.draft_revision, 'content', dr.content)),
      jsonb_build_object('kind', 'contraste', 'schemaVersion', 1, 'draftId', dr.id, 'draftRevision', dr.draft_revision,
        'result', p_result, 'findings', p_findings),
      p_model_id, p_prompt_version, 'contraste-v1', p_limitations)
    returning created_at into created;
  insert into public.report_sources(document_id, report_id, message_id, extraction_id)
    select p_document_id, rid, case when i->>'kind' = 'mensaje' then (i->>'id')::uuid end,
        case when i->>'kind' = 'extraccion' then (i->>'id')::uuid end
      from jsonb_array_elements(p_inputs) i where i->>'kind' in ('mensaje', 'extraccion');
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, p_actor_id::text, 'contrast_report.created', 'verification_report', rid, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'draftRevision', dr.draft_revision,
        'result', p_result, 'findingCount', jsonb_array_length(p_findings)));
  return jsonb_build_object('status', 'created', 'reportId', rid,
    'createdAt', to_char(created at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end
$$;

-- Propiedad y permisos de ejecución (mismo mecanismo que 02500/02501).
grant create on schema public to galcoa_contrast_writer;
grant galcoa_contrast_writer to postgres with set true;
alter function public.persist_contrast_report(uuid, uuid, uuid, integer, jsonb, text, jsonb, jsonb, text, text, jsonb, text) owner to galcoa_contrast_writer;
set local role galcoa_contrast_writer;
revoke all on function public.persist_contrast_report(uuid, uuid, uuid, integer, jsonb, text, jsonb, jsonb, text, text, jsonb, text)
  from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.persist_contrast_report(uuid, uuid, uuid, integer, jsonb, text, jsonb, jsonb, text, text, jsonb, text)
  to galcoa_executor;
reset role;
revoke create on schema public from galcoa_contrast_writer;
grant galcoa_contrast_writer to postgres with set false, inherit false;
