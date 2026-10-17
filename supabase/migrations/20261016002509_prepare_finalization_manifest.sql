-- Manifiesto privado durable bajo el claim (MVP-082, C082-2/3). Aditiva sobre 02504/02506: dos funciones,
-- ninguna tabla nueva (los bytes del detalle privado van a `artifact_staging`, kind = 'manifest').
--
-- · `get_finalization_manifest_input`: entradas del detalle privado, leídas solo de lo persistido (evidencias y
--   reportes citados por el snapshot, constancias del mismo snapshot, antecedente y nonce reservados al claim).
--   Exige el fencing vigente y el PDF ya en staging. Devuelve además el detalle ya guardado, si existe.
-- · `prepare_finalization_manifest`: INSERT único de los bytes canónicos del detalle privado (hash y longitud
--   derivados de los bytes) y avance atómico `pdf_staged → manifest_ready`. Comprueba que el detalle repite las
--   identidades y el nonce reservados por el claim y devuelve el `manifestHash` recalculado en SQL (el envelope
--   público son cuatro cadenas, su JCS es determinista) para que el servicio lo contraste con el suyo.
--     · mismo fencing y mismos bytes → `already_prepared` (idempotente, aun con el lease vencido: no escribe);
--     · mismo fencing con bytes distintos → `conflict` (nunca se sobrescribe);
--     · fencing distinto → `stale_fencing`; abandonada → `abandoned`; lease vencido sin bytes → `lease_expired`.
-- Orden de locks: documento → operación. Solo `galcoa_executor`, con actor explícito. No publica, no sube a
-- Storage ni toca Hedera. Propietario: `galcoa_f7_writer` (mismo mecanismo que 02504).

grant select on public.evidences, public.report_sources, public.snapshot_sources to galcoa_f7_writer;
create policy f8_manifest_evidences on public.evidences for select to galcoa_f7_writer using (true);
create policy f8_manifest_report_sources on public.report_sources for select to galcoa_f7_writer using (true);
create policy f8_manifest_snapshot_sources on public.snapshot_sources for select to galcoa_f7_writer using (true);

-- Instante con precisión de milisegundos fija (perfil del manifiesto): se trunca, no se redondea.
create function private.f8_ts_ms(t timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- JCS del envelope público {pdfHash, privateDetailHash, reference, schemaVersion} (claves ya ordenadas, ASCII).
create function private.f8_manifest_hash(p_reference text, p_pdf_hash text, p_detail_hash text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(
    '{"pdfHash":"' || p_pdf_hash || '","privateDetailHash":"' || p_detail_hash ||
    '","reference":"' || p_reference || '","schemaVersion":"galcoa.manifest.v1"}', 'UTF8')), 'hex')
$$;

create function public.get_finalization_manifest_input(p_actor_id uuid, p_operation_id uuid, p_fencing bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  op public.finalization_operations; rev public.document_revisions;
  pdf public.artifact_staging; mf public.artifact_staging;
  evs jsonb; reps jsonb; confs jsonb; prev jsonb;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1 then raise invalid_parameter_value; end if;
  select o.* into op from public.finalization_operations o join public.documents d on d.id = o.document_id
    where o.id = p_operation_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if op.status = 'abandoned' then return jsonb_build_object('status', 'abandoned'); end if;
  if op.fencing <> p_fencing then return jsonb_build_object('status', 'stale_fencing'); end if;
  select * into rev from public.document_revisions where id = op.revision_id;
  select * into pdf from public.artifact_staging where operation_id = op.id and kind = 'pdf';
  if not found then return jsonb_build_object('status', 'pdf_missing'); end if;
  select * into mf from public.artifact_staging where operation_id = op.id and kind = 'manifest';

  select coalesce(jsonb_agg(jsonb_build_object('evidenceId', e.id, 'sha256', e.sha256) order by e.id::text collate "C"), '[]'::jsonb) into evs
    from public.evidences e where e.id in (
      select s.evidence_id from public.snapshot_sources s where s.snapshot_id = op.snapshot_id and s.evidence_id is not null
      union
      select rs.evidence_id from public.report_sources rs join public.snapshot_sources s on s.report_id = rs.report_id
        where s.snapshot_id = op.snapshot_id and rs.evidence_id is not null);

  select coalesce(jsonb_agg(jsonb_build_object('reportId', r.id,
      'report', jsonb_build_object('input', r.input, 'output', r.output, 'model', r.model, 'promptVersion', r.prompt_version,
        'rulesVersion', r.rules_version, 'limitations', r.limitations),
      'sources', coalesce((select jsonb_agg(jsonb_build_object(
          'type', case when s.message_id is not null then 'message' when s.evidence_id is not null then 'evidence' else 'extraction' end,
          'id', coalesce(s.message_id, s.evidence_id, s.extraction_id)))
        from public.report_sources s where s.report_id = r.id), '[]'::jsonb))
    order by r.id::text collate "C"), '[]'::jsonb) into reps
    from public.verification_reports r where r.id in (select s.report_id from public.snapshot_sources s where s.snapshot_id = op.snapshot_id and s.report_id is not null);

  select coalesce(jsonb_agg(jsonb_build_object('responseId', c.id, 'role', c.role, 'snapshotHash', c.snapshot_hash,
      'decision', 'confirmar', 'checkbox', c.checkbox_checked, 'declaredName', c.declared_name,
      'ratifiedRejection', c.ratified_rejection, 'respondedAt', private.f8_ts_ms(c.responded_at))
    order by array_position(array['autor', 'intermediario', 'comprador'], c.role)), '[]'::jsonb) into confs
    from public.corroboration_responses c
    where c.revision_id = op.revision_id and c.snapshot_hash = op.snapshot_hash and c.decision = 'confirmada' and c.role = any(rev.selection);

  select jsonb_build_object('versionId', v.id, 'manifestHash', v.manifest_hash) into prev
    from public.document_versions v where v.id = op.previous_version_id;

  return jsonb_build_object('status', 'ready', 'operationId', op.id, 'phase', op.phase,
    'versionId', op.reserved_version_id, 'revisionId', op.revision_id, 'snapshotId', op.snapshot_id,
    'snapshotHash', op.snapshot_hash, 'publicReference', op.public_reference, 'nonce', encode(op.nonce, 'hex'),
    'pdf', jsonb_build_object('sha256', pdf.sha256, 'byteLength', pdf.byte_length),
    'evidences', evs, 'reports', reps, 'confirmations', confs, 'previousVersion', prev,
    'staged', case when mf.id is null then null else jsonb_build_object('sha256', mf.sha256, 'byteLength', mf.byte_length) end);
end
$$;

create function public.prepare_finalization_manifest(p_actor_id uuid, p_operation_id uuid, p_fencing bigint, p_detail bytea, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  doc uuid; op public.finalization_operations; pdf public.artifact_staging; mf public.artifact_staging;
  digest text; detail jsonb;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_operation_id is null or p_fencing is null or p_fencing < 1 or p_detail is null or octet_length(p_detail) = 0
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
  if not found then raise exception 'finalization: falta el PDF en staging' using errcode = 'restrict_violation'; end if;

  digest := encode(sha256(p_detail), 'hex');
  select * into mf from public.artifact_staging where operation_id = op.id and kind = 'manifest';
  if found then
    return jsonb_build_object('status', case when mf.sha256 = digest then 'already_prepared' else 'conflict' end,
      'sha256', mf.sha256, 'byteLength', mf.byte_length,
      'manifestHash', private.f8_manifest_hash(op.public_reference, pdf.sha256, mf.sha256));
  end if;
  if op.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status', 'lease_expired'); end if;
  if op.phase <> 'pdf_staged' then raise exception 'finalization: la fase no admite el manifiesto' using errcode = 'restrict_violation'; end if;

  -- El detalle debe repetir las identidades y el nonce reservados al claim; no se confía en lo enviado.
  detail := convert_from(p_detail, 'UTF8')::jsonb;
  if detail->>'schemaVersion' is distinct from 'galcoa.private-detail.v1'
     or detail->>'versionId' is distinct from op.reserved_version_id::text
     or detail->>'revisionId' is distinct from op.revision_id::text
     or detail->>'snapshotId' is distinct from op.snapshot_id::text
     or detail->>'snapshotHash' is distinct from op.snapshot_hash
     or detail->>'nonce' is distinct from encode(op.nonce, 'hex')
     or detail#>>'{previousVersion,versionId}' is distinct from op.previous_version_id::text then
    raise exception 'finalization: el detalle no coincide con la reserva' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.artifact_staging(operation_id, kind, content, sha256, byte_length)
    values(op.id, 'manifest', p_detail, digest, octet_length(p_detail));
  update public.finalization_operations set phase = 'manifest_ready', updated_at = clock_timestamp() where id = op.id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(doc, p_actor_id::text, 'finalization.manifest_ready', 'finalization', op.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing,
        'privateDetailHash', digest, 'byteLength', octet_length(p_detail)));
  return jsonb_build_object('status', 'prepared', 'sha256', digest, 'byteLength', octet_length(p_detail),
    'manifestHash', private.f8_manifest_hash(op.public_reference, pdf.sha256, digest));
end
$$;

grant create on schema public, private to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function private.f8_ts_ms(timestamptz) owner to galcoa_f7_writer;
alter function private.f8_manifest_hash(text, text, text) owner to galcoa_f7_writer;
alter function public.get_finalization_manifest_input(uuid, uuid, bigint) owner to galcoa_f7_writer;
alter function public.prepare_finalization_manifest(uuid, uuid, bigint, bytea, text) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.get_finalization_manifest_input(uuid, uuid, bigint), public.prepare_finalization_manifest(uuid, uuid, bigint, bytea, text)
  from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_finalization_manifest_input(uuid, uuid, bigint), public.prepare_finalization_manifest(uuid, uuid, bigint, bytea, text)
  to galcoa_executor;
reset role;
revoke create on schema public, private from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
