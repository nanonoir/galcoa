-- Publicación atómica de la versión inmutable (MVP-083, C083-1). Aditiva sobre 02504/02506/02509: tres funciones,
-- ninguna tabla nueva (usa `artifact_reservations`, `document_versions`, `version_artifacts`, `version_receipts`).
--
-- · `reserve_finalization_objects`: con el manifiesto listo, reserva un objeto privado por artefacto (`pdf`,
--   `manifest`) para el fencing vigente. Nombres opacos y únicos; las reservas de un fencing anterior pasan a
--   `superseded` (nunca se borran). Repetir la llamada con el mismo fencing devuelve las mismas reservas.
-- · `get_finalization_staged_content`: bytes (hex) y huella del artefacto en staging, para subirlos tal cual a
--   Storage sin volver a renderizar ni reconstruir el detalle.
-- · `publish_version`: con el fencing y el lease vigentes y las huellas/longitudes que el servidor comprobó en
--   Storage (deben repetir el staging), inserta la versión inmutable (envelope público, `manifest_hash`,
--   antecedente reservado), sus artefactos y constancias, adopta las reservas, marca el documento finalizado,
--   audita y avanza `manifest_ready → object_checked → published` en una sola transacción. El sello HCS no se
--   toca: sin intentos ni registros queda `no_iniciado`. Un fallo no deja la versión a medias.
--     · versión ya publicada → `already_published` (idempotente, sin escribir);
--     · huellas distintas del staging → `conflict` (nunca se sobrescribe);
--     · fencing distinto → `stale_fencing`; abandonada → `abandoned`; lease vencido → `lease_expired`.
-- Orden de locks: documento → operación. Solo `galcoa_executor`, con actor explícito. No sube a Storage ni toca
-- Hedera. Propietario: `galcoa_f7_writer` (mismo mecanismo que 02504).

grant select, insert on public.artifact_reservations, public.version_artifacts, public.version_receipts to galcoa_f7_writer;
grant update (state, expires_at) on public.artifact_reservations to galcoa_f7_writer;
grant insert on public.document_versions to galcoa_f7_writer;
grant update (last_version_id, version_seq) on public.documents to galcoa_f7_writer;
create policy f8_reservations on public.artifact_reservations to galcoa_f7_writer using (true) with check (true);
create policy f8_version_artifacts on public.version_artifacts to galcoa_f7_writer using (true) with check (true);
create policy f8_version_receipts on public.version_receipts to galcoa_f7_writer using (true) with check (true);
create policy f8_versions_insert on public.document_versions for insert to galcoa_f7_writer with check (true);

create function public.reserve_finalization_objects(p_actor_id uuid, p_operation_id uuid, p_fencing bigint, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  doc uuid; op public.finalization_operations; k text; res public.artifact_reservations; stg public.artifact_staging;
  ver public.document_versions; items jsonb := '[]'::jsonb; created boolean := false;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select o.document_id into doc from public.finalization_operations o where o.id = p_operation_id;
  if doc is null then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into op from public.finalization_operations where id = p_operation_id for update;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  if op.phase = 'published' then
    select * into ver from public.document_versions where id = op.reserved_version_id;
    return jsonb_build_object('status', 'already_published', 'versionId', ver.id, 'versionNumber', ver.version_number, 'manifestHash', ver.manifest_hash);
  end if;
  if private.phase_rank(op.phase) < private.phase_rank('manifest_ready') then
    raise exception 'finalization: el manifiesto aún no está listo' using errcode = 'restrict_violation';
  end if;

  foreach k in array array['pdf', 'manifest'] loop
    select * into stg from public.artifact_staging where operation_id = op.id and kind = k;
    if not found then raise exception 'finalization: falta el artefacto en staging' using errcode = 'restrict_violation'; end if;
    select * into res from public.artifact_reservations where operation_id = op.id and kind = k and fencing = op.fencing;
    if not found then
      if op.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status', 'lease_expired'); end if;
      update public.artifact_reservations set state = 'superseded'
        where operation_id = op.id and kind = k and state = 'active' and fencing < op.fencing;
      insert into public.artifact_reservations(operation_id, document_id, kind, fencing, object_path, expires_at)
        values(op.id, doc, k, op.fencing, doc::text || '/' || k || '/' || gen_random_uuid()::text, op.lease_expires_at)
        returning * into res;
      created := true;
    end if;
    items := items || jsonb_build_object('kind', k, 'objectPath', res.object_path, 'sha256', stg.sha256, 'byteLength', stg.byte_length);
  end loop;
  if created then
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(doc, p_actor_id::text, 'finalization.objects_reserved', 'finalization', op.id, 'ok',
        jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing));
  end if;
  return jsonb_build_object('status', 'reserved', 'artifacts', items);
end
$$;

create function public.get_finalization_staged_content(p_actor_id uuid, p_operation_id uuid, p_fencing bigint, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  op public.finalization_operations; stg public.artifact_staging;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1 or p_kind is null or p_kind not in ('pdf', 'manifest') then
    raise invalid_parameter_value;
  end if;
  select o.* into op from public.finalization_operations o join public.documents d on d.id = o.document_id
    where o.id = p_operation_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  select * into stg from public.artifact_staging where operation_id = op.id and kind = p_kind;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  return jsonb_build_object('status', 'ready', 'sha256', stg.sha256, 'byteLength', stg.byte_length, 'contentHex', encode(stg.content, 'hex'));
end
$$;

create function public.publish_version(
  p_actor_id uuid, p_operation_id uuid, p_fencing bigint,
  p_pdf_sha256 text, p_pdf_length bigint, p_manifest_sha256 text, p_manifest_length bigint, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  doc uuid; op public.finalization_operations; rev public.document_revisions; pdf public.artifact_staging; mf public.artifact_staging;
  rp public.artifact_reservations; rm public.artifact_reservations; mhash text; env jsonb;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1
     or p_pdf_sha256 is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' or p_pdf_length is null or p_pdf_length < 1
     or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' or p_manifest_length is null or p_manifest_length < 1
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select o.document_id into doc from public.finalization_operations o where o.id = p_operation_id;
  if doc is null then return jsonb_build_object('status', 'not_available'); end if;
  perform 1 from public.documents where id = doc and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into op from public.finalization_operations where id = p_operation_id for update;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;

  select * into pdf from public.artifact_staging where operation_id = op.id and kind = 'pdf';
  select * into mf from public.artifact_staging where operation_id = op.id and kind = 'manifest';
  if pdf.id is null or mf.id is null then raise exception 'finalization: faltan artefactos en staging' using errcode = 'restrict_violation'; end if;
  mhash := private.f8_manifest_hash(op.public_reference, pdf.sha256, mf.sha256);
  if op.phase = 'published' then
    return jsonb_build_object('status', 'already_published', 'versionId', op.reserved_version_id, 'versionNumber', op.version_number, 'manifestHash', mhash);
  end if;
  if pdf.sha256 <> p_pdf_sha256 or pdf.byte_length <> p_pdf_length or mf.sha256 <> p_manifest_sha256 or mf.byte_length <> p_manifest_length then
    return jsonb_build_object('status', 'conflict');
  end if;
  if op.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status', 'lease_expired'); end if;
  if op.phase <> 'manifest_ready' then raise exception 'finalization: la fase no admite publicar' using errcode = 'restrict_violation'; end if;
  select * into rp from public.artifact_reservations where operation_id = op.id and kind = 'pdf' and fencing = op.fencing and state = 'active';
  select * into rm from public.artifact_reservations where operation_id = op.id and kind = 'manifest' and fencing = op.fencing and state = 'active';
  if rp.id is null or rm.id is null then raise exception 'finalization: faltan las reservas de objeto' using errcode = 'restrict_violation'; end if;
  select * into rev from public.document_revisions where id = op.revision_id;

  update public.finalization_operations set phase = 'object_checked', updated_at = clock_timestamp() where id = op.id;
  env := jsonb_build_object('schemaVersion', 'galcoa.manifest.v1', 'reference', op.public_reference,
    'pdfHash', pdf.sha256, 'privateDetailHash', mf.sha256);
  insert into public.document_versions(id, document_id, operation_id, revision_id, snapshot_id, snapshot_hash, version_number,
      previous_version_id, public_reference, schema_version, envelope, manifest_hash)
    values(op.reserved_version_id, doc, op.id, op.revision_id, op.snapshot_id, op.snapshot_hash, op.version_number,
      op.previous_version_id, op.public_reference, 1, env, mhash);
  insert into public.version_artifacts(version_id, kind, object_path, sha256, byte_length)
    values(op.reserved_version_id, 'pdf', rp.object_path, pdf.sha256, pdf.byte_length),
          (op.reserved_version_id, 'manifest', rm.object_path, mf.sha256, mf.byte_length);
  insert into public.version_receipts(version_id, response_id, revision_id)
    select op.reserved_version_id, c.id, c.revision_id from public.corroboration_responses c
    where c.revision_id = op.revision_id and c.snapshot_hash = op.snapshot_hash and c.decision = 'confirmada' and c.role = any(rev.selection);
  update public.artifact_reservations set state = 'adopted' where id in (rp.id, rm.id);
  update public.documents set last_version_id = op.reserved_version_id, version_seq = greatest(version_seq, op.version_number),
      document_status = 'finalizado', updated_at = clock_timestamp() where id = doc;
  update public.finalization_operations set phase = 'published', updated_at = clock_timestamp() where id = op.id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'finalization.published', 'finalization', op.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing,
        'versionId', op.reserved_version_id, 'versionNumber', op.version_number, 'manifestHash', mhash));
  return jsonb_build_object('status', 'published', 'versionId', op.reserved_version_id, 'versionNumber', op.version_number, 'manifestHash', mhash);
end
$$;

grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.reserve_finalization_objects(uuid, uuid, bigint, text) owner to galcoa_f7_writer;
alter function public.get_finalization_staged_content(uuid, uuid, bigint, text) owner to galcoa_f7_writer;
alter function public.publish_version(uuid, uuid, bigint, text, bigint, text, bigint, text) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.reserve_finalization_objects(uuid, uuid, bigint, text), public.get_finalization_staged_content(uuid, uuid, bigint, text),
  public.publish_version(uuid, uuid, bigint, text, bigint, text, bigint, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.reserve_finalization_objects(uuid, uuid, bigint, text), public.get_finalization_staged_content(uuid, uuid, bigint, text),
  public.publish_version(uuid, uuid, bigint, text, bigint, text, bigint, text) to galcoa_executor;
reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
