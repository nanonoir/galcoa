-- 001200 ya aplicada localmente: extensión coherente del catálogo, sin editar F4.
grant galcoa_f4_writer to postgres with set true;
grant create on schema public to galcoa_f4_writer;
grant select on public.evidences, public.evidence_extractions to galcoa_f4_writer;
create policy f4_audit_evidences on public.evidences for select to galcoa_f4_writer using (true);
create policy f4_audit_extractions on public.evidence_extractions for select to galcoa_f4_writer using (true);
set local role galcoa_f4_writer;
create or replace function public.append_document_audit(p_actor_id uuid, p_document_id uuid, p_type text, p_resource_id uuid, p_outcome text, p_correlation_id text, p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare prior public.idempotency_records; resource_kind text; fp text;
begin
  perform 1 from public.documents where id = p_document_id and owner_id = p_actor_id for update;
  if not found then raise insufficient_privilege; end if;
  if p_type = 'document.created' and p_resource_id = p_document_id then resource_kind := 'document';
  elsif p_type = 'message.recorded' and exists(select 1 from public.messages where id = p_resource_id and document_id = p_document_id) then resource_kind := 'message';
  elsif p_type = 'evidence.accepted' and exists(select 1 from public.evidences where id = p_resource_id and document_id = p_document_id and upload_state = 'accepted') then resource_kind := 'evidence';
  elsif p_type = 'extraction.recorded' and exists(select 1 from public.evidence_extractions where id = p_resource_id and document_id = p_document_id) then resource_kind := 'extraction';
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
end $$;
reset role;
revoke create on schema public from galcoa_f4_writer;
grant galcoa_f4_writer to postgres with set false,inherit false;
