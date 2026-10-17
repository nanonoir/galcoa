-- Reclamo de finalización (MVP-080, C080-2/3): una operación durable por revisión, con lease y fencing.
-- Aditiva sobre C3/F7: no cambia tablas ni funciones existentes. Orden de locks: documento → revisión →
-- borrador → (operación, protegida por la revisión). Sin PDF, manifiesto, HCS ni Storage: eso llega después
-- del claim (MVP-081+).
--
-- Elegibilidad bajo lock, en una sola unidad (el cliente y la IA no deciden nada):
--   · el documento es del actor y la revisión pertenece a él;
--   · la revisión es la activa del documento (no sustituida);
--   · la revisión proviene del borrador vigente: `frozen_from_draft_revision = drafts.draft_revision`.
--     Si el borrador siguió avanzando, la revisión congelada ya no representa lo que el autor ve y no se
--     finaliza (`draft_changed`): hay que congelar otra revisión, que no hereda confirmaciones;
--   · el agregado del mismo snapshot es `completa` (todas las seleccionadas confirmadas, ninguna negativa).
-- Una advertencia crítica del contenido no bloquea (INV-02) y aquí no se consulta.
--
-- Reintento: repetir el reclamo de una revisión con operación NO crea otra versión ni reserva otra identidad.
--   · lease vigente → `in_progress` sin fencing (quien no es dueño no puede avanzar fases);
--   · lease vencido o abandonada → toma con fencing + 1 y lease nuevo (la fase no retrocede);
--   · publicada → `published` (terminal, solo lectura).
-- Mientras la operación esté activa (sin publicar), la revisión no puede sustituirse (trigger de respaldo:
-- `freeze_revision` fallaría con restrict_violation; el mapeo a un estado estable es del adaptador).
--
-- Propietario: `galcoa_f7_writer` (mismo mecanismo que 02100). Reloj de lease: SQL (`clock_timestamp()`).

grant select, insert, update on public.finalization_operations to galcoa_f7_writer;
grant select on public.document_versions to galcoa_f7_writer;
grant update (updated_at) on public.drafts to galcoa_f7_writer;
-- La guarda de fases (trigger, invocador) usa este ayudante al reanudar.
grant execute on function private.phase_rank(text) to galcoa_f7_writer;
create policy f8_operations on public.finalization_operations to galcoa_f7_writer using (true) with check (true);
create policy f8_versions on public.document_versions for select to galcoa_f7_writer using (true);
create policy f8_drafts_lock on public.drafts for update to galcoa_f7_writer using (true) with check (true);

create function private.f8_operation_json(o public.finalization_operations, with_fencing boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('operationId', o.id, 'revisionId', o.revision_id, 'snapshotId', o.snapshot_id,
    'snapshotHash', o.snapshot_hash, 'versionId', o.reserved_version_id, 'versionNumber', o.version_number,
    'previousVersionId', o.previous_version_id, 'renderer', o.renderer, 'phase', o.phase, 'status', o.status,
    'leaseExpiresAt', private.f7_ts(o.lease_expires_at))
    || case when with_fencing then jsonb_build_object('fencing', o.fencing) else '{}'::jsonb end
$$;

-- La revisión de una operación activa sin publicar no se sustituye (respaldo de la carrera congelar vs. claim).
create function private.f8_revision_pinned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lifecycle = 'sustituida' and old.lifecycle <> 'sustituida' and exists (
      select 1 from public.finalization_operations o
      where o.revision_id = old.id and o.status = 'active' and o.phase <> 'published') then
    raise exception 'document_revisions: hay una finalización en curso para esta revisión' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_revisions_pinned before update of lifecycle on public.document_revisions
  for each row execute function private.f8_revision_pinned();

create function public.claim_finalization(
  p_document_id uuid, p_revision_id uuid, p_renderer text, p_lease_seconds integer, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; rev public.document_revisions; dr public.drafts;
  op public.finalization_operations; next_number integer; prev uuid; agg text; lease timestamptz;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_revision_id is null or p_renderer is null or char_length(p_renderer) not between 1 and 64
     or p_lease_seconds is null or p_lease_seconds not between 1 and 3600
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select * into d from public.documents where id = p_document_id and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into rev from public.document_revisions where id = p_revision_id and document_id = p_document_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  select * into dr from public.drafts where document_id = p_document_id for update;
  lease := clock_timestamp() + make_interval(secs => p_lease_seconds);

  select * into op from public.finalization_operations where revision_id = rev.id;
  if found then
    if op.phase = 'published' then return jsonb_build_object('status', 'published', 'operation', private.f8_operation_json(op, false)); end if;
    if op.status = 'active' and op.lease_expires_at > clock_timestamp() then
      return jsonb_build_object('status', 'in_progress', 'operation', private.f8_operation_json(op, false));
    end if;
    update public.finalization_operations set status = 'active', fencing = fencing + 1, lease_expires_at = lease,
        error_code = null, updated_at = clock_timestamp() where id = op.id returning * into op;
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(p_document_id, actor::text, 'finalization.resumed', 'finalization', op.id, 'ok',
        jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing));
    return jsonb_build_object('status', 'resumed', 'operation', private.f8_operation_json(op, true));
  end if;

  if rev.lifecycle <> 'activa' or d.active_revision_id is distinct from rev.id then
    return jsonb_build_object('status', 'revision_not_active');
  end if;
  if dr.id is null or dr.draft_revision <> rev.frozen_from_draft_revision then
    return jsonb_build_object('status', 'draft_changed');
  end if;
  agg := private.f7_aggregate(rev.id);
  if agg = 'rechazada' then return jsonb_build_object('status', 'rejected'); end if;
  if agg <> 'completa' then return jsonb_build_object('status', 'confirmations_missing'); end if;

  select coalesce(max(n), 0) + 1 into next_number from (
    select version_number n from public.document_versions where document_id = p_document_id
    union all select version_number from public.finalization_operations where document_id = p_document_id) t;
  select id into prev from public.document_versions where document_id = p_document_id order by version_number desc limit 1;

  insert into public.finalization_operations(document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id,
      version_number, previous_version_id, renderer, public_reference, nonce, lease_expires_at)
    values(p_document_id, rev.id, rev.snapshot_id, rev.snapshot_hash, gen_random_uuid(), next_number, prev, p_renderer,
      replace(gen_random_uuid()::text, '-', ''),
      decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), lease)
    returning * into op;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, actor::text, 'finalization.claimed', 'finalization', op.id, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'fencing', op.fencing));
  return jsonb_build_object('status', 'claimed', 'operation', private.f8_operation_json(op, true));
end
$$;

grant create on schema public, private to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.claim_finalization(uuid, uuid, text, integer, text) owner to galcoa_f7_writer;
alter function private.f8_operation_json(public.finalization_operations, boolean) owner to galcoa_f7_writer;
alter function private.f8_revision_pinned() owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.claim_finalization(uuid, uuid, text, integer, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.claim_finalization(uuid, uuid, text, integer, text) to authenticated;
reset role;
revoke create on schema public, private from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
