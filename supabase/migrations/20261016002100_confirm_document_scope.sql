-- Corrección de cierre: la confirmación del autor valida que la revisión pertenezca al documento de la ruta.
-- Migración aditiva: reemplaza la firma de `confirm_as_author` (sin sobrecarga heredada alcanzable).
-- Documento ajeno, revisión de otro documento e inexistente devuelven el mismo `not_available`.
drop function public.confirm_as_author(uuid, uuid, text, text, text, text);

create function public.confirm_as_author(
  p_document_id uuid, p_revision_id uuid, p_snapshot_id uuid, p_snapshot_hash text, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; rev public.document_revisions; prior public.idempotency_records;
  part public.revision_participants; resp public.corroboration_responses; new_status text; doc uuid;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_revision_id is null or p_snapshot_id is null or p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or not private.f7_valid_idempotency(p_key, p_fingerprint, p_correlation_id) then
    raise invalid_parameter_value;
  end if;
  select document_id into doc from public.document_revisions where id = p_revision_id and document_id = p_document_id;
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

grant create on schema public, private to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.confirm_as_author(uuid, uuid, uuid, text, text, text, text) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.confirm_as_author(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.confirm_as_author(uuid, uuid, uuid, text, text, text, text) to authenticated;
reset role;
revoke create on schema public, private from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
