-- Staging canónico del PDF bajo el claim (MVP-081, C081-2). Aditiva sobre 02504: dos funciones, ninguna tabla nueva.
--
-- · `get_finalization_render_input`: entrada del render, leída del snapshot congelado y de las respuestas
--   persistidas del mismo snapshot (nunca del borrador, la IA ni el navegador). Exige el fencing vigente.
--   Devuelve además el PDF ya en staging (hash y longitud) para que un reintento no vuelva a renderizar.
-- · `stage_finalization_pdf`: INSERT único de los bytes en `artifact_staging` (hash y longitud derivados de
--   los bytes, no confiados al request) y avance atómico `reserved → pdf_staged`. No publica la versión, no
--   sube a Storage ni toca Hedera. Orden de locks: documento → operación.
--     · mismo fencing y mismos bytes → `already_staged` (idempotente, aun con el lease vencido: no escribe);
--     · mismo fencing con bytes distintos → `conflict` (nunca se sobrescribe);
--     · fencing distinto → `stale_fencing`; operación abandonada → `abandoned`;
--     · lease vencido sin bytes guardados → `lease_expired`; ajeno o inexistente → `not_available`.
--
-- Solo `galcoa_executor` las ejecuta, con actor explícito (`p_actor_id`); el propietario no puede inyectar
-- bytes arbitrarios. Propietario: `galcoa_f7_writer` (mismo mecanismo que 02504).

grant select, insert on public.artifact_staging to galcoa_f7_writer;
create policy f8_staging on public.artifact_staging to galcoa_f7_writer using (true) with check (true);

create function public.get_finalization_render_input(p_actor_id uuid, p_operation_id uuid, p_fencing bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  op public.finalization_operations; snap public.revision_snapshots; rev public.document_revisions;
  stg public.artifact_staging; receipts jsonb;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1 then raise invalid_parameter_value; end if;
  select o.* into op from public.finalization_operations o join public.documents d on d.id = o.document_id
    where o.id = p_operation_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  select * into rev from public.document_revisions where id = op.revision_id;
  select * into snap from public.revision_snapshots where revision_id = op.revision_id and id = op.snapshot_id and snapshot_hash = op.snapshot_hash;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('responseId', r.id, 'role', r.role, 'decision', 'confirmar',
      'declaredName', r.declared_name, 'respondedAt', private.f7_ts(r.responded_at))
    order by array_position(array['autor', 'intermediario', 'comprador'], r.role)), '[]'::jsonb) into receipts
    from public.corroboration_responses r
    where r.revision_id = op.revision_id and r.snapshot_hash = op.snapshot_hash and r.decision = 'confirmada' and r.role = any(rev.selection);
  select * into stg from public.artifact_staging where operation_id = op.id and kind = 'pdf';
  return jsonb_build_object('status', 'ready', 'operationId', op.id, 'revisionId', op.revision_id, 'phase', op.phase,
    'renderer', op.renderer, 'publicReference', op.public_reference, 'snapshotHash', op.snapshot_hash,
    'claimedAt', private.f7_ts(op.created_at), 'content', snap.content, 'receipts', receipts,
    'staged', case when stg.id is null then null else jsonb_build_object('sha256', stg.sha256, 'byteLength', stg.byte_length) end);
end
$$;

create function public.stage_finalization_pdf(p_actor_id uuid, p_operation_id uuid, p_fencing bigint, p_content bytea, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  doc uuid; op public.finalization_operations; stg public.artifact_staging; digest text;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1 or p_content is null or octet_length(p_content) = 0
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  -- Resolver sin lock solo encuentra el documento; se revalida bajo lock (documento → operación).
  select o.document_id into doc from public.finalization_operations o where o.id = p_operation_id;
  if doc is null then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into op from public.finalization_operations where id = p_operation_id for update;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;

  digest := encode(sha256(p_content), 'hex');
  select * into stg from public.artifact_staging where operation_id = op.id and kind = 'pdf';
  if found then
    return jsonb_build_object('status', case when stg.sha256 = digest then 'already_staged' else 'conflict' end,
      'sha256', stg.sha256, 'byteLength', stg.byte_length);
  end if;
  if op.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status', 'lease_expired'); end if;
  if op.phase <> 'reserved' then raise exception 'finalization: la fase no admite staging' using errcode = 'restrict_violation'; end if;

  insert into public.artifact_staging(operation_id, kind, content, sha256, byte_length)
    values(op.id, 'pdf', p_content, digest, octet_length(p_content));
  update public.finalization_operations set phase = 'pdf_staged', updated_at = clock_timestamp() where id = op.id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'finalization.pdf_staged', 'finalization', op.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing,
        'sha256', digest, 'byteLength', octet_length(p_content)));
  return jsonb_build_object('status', 'staged', 'sha256', digest, 'byteLength', octet_length(p_content));
end
$$;

grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.get_finalization_render_input(uuid, uuid, bigint) owner to galcoa_f7_writer;
alter function public.stage_finalization_pdf(uuid, uuid, bigint, bytea, text) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.get_finalization_render_input(uuid, uuid, bigint), public.stage_finalization_pdf(uuid, uuid, bigint, bytea, text)
  from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_finalization_render_input(uuid, uuid, bigint), public.stage_finalization_pdf(uuid, uuid, bigint, bytea, text)
  to galcoa_executor;
reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
