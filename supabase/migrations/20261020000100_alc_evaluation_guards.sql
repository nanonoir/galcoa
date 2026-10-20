-- Veredicto ALC (F-1 a F-5; docs/exec-plans/active/alineacion-distribuidoras.md). ADITIVA: no edita migraciones ya
-- aplicadas y NO debe aplicarse sin la revisión independiente de SQL que exige el plan. No se ejecutó en ninguna base.
--
-- Qué hace
--   · `alc_evaluations`: evaluación determinista persistida (append-only). El veredicto lo calcula TypeScript (puro) y
--     lo persiste SOLO el ejecutor (`galcoa_executor`) con `save_alc_evaluation`. SQL no recalcula el color, pero lo
--     valida contra los hallazgos (reglas) y contra el inventario exacto de fuentes del documento: nunca confía en un
--     color suelto ni en un `controlStatus` del llamador.
--   · `document_revisions.alc_evaluation_id`: toda revisión NUEVA exige una evaluación y una selección de dos o tres
--     roles (autor+comprador, con transportista opcional). Las revisiones históricas (v1) quedan legibles y sin evaluación.
--   · `freeze_revision` v2 (firma antigua RETIRADA): recibe `p_evaluation_id`, deriva el control documental de la
--     evaluación (no del llamador), exige que el snapshot repita la evaluación y escribe `schema_version` 2.
--   · Orden de respuesta autor → transportista → comprador, también en SQL (trigger sobre `corroboration_responses`).
--   · Guardas de sellado: `claim_finalization` (reclamo y reanudación), `document_versions` (publicación),
--     `record_seal_intent` y `hedera_attempts` (respaldo), más `check_seal_eligibility` (auditada, solo ejecutor).
--
-- Códigos de bloqueo (idénticos a `ALC_BLOCK` en src/lib/contracts/alc.ts):
--   evaluation_required · stale_evaluation · selection_invalid · red. Una versión histórica sin evaluación se informa
--   como `legacy_without_alc` en el sello: no inicia intentos nuevos (la reconciliación de los existentes no se toca).
-- Vigencia del inventario (`stale_evaluation`) solo en el congelado y en el reclamo NUEVO. En reanudación, publicación y
--   sello la revisión ya es inmutable: exigir inventario vigente dejaría una operación fijada sin salida.
--
-- Propietarios: funciones públicas con `galcoa_f7_writer` / `galcoa_seal_writer` (mecanismo de 02100/02503); ayudantes y
-- triggers privados con `postgres` (SECURITY DEFINER, `search_path` vacío), sin grants a roles de la API.

-- Evaluaciones -----------------------------------------------------------------------------------------------------

create table public.alc_evaluations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  draft_revision integer not null check (draft_revision >= 0),
  rules_version text not null check (char_length(rules_version) between 1 and 64),
  -- Solo las dos selecciones nuevas válidas; las cuatro históricas siguen permitidas en `document_revisions`.
  selection text[] not null check (selection in (array['autor', 'comprador'], array['autor', 'intermediario', 'comprador'])),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  color text not null check (color in ('verde', 'amarillo', 'rojo')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  -- Resumen compartible (sin ids ni rutas): se copia tal cual al snapshot v2.
  shared jsonb not null check (jsonb_typeof(shared) = 'object'),
  rectifications jsonb not null default '[]'::jsonb check (jsonb_typeof(rectifications) = 'array'),
  -- Mapeo privado alias → fuente real, para `snapshot_sources` al congelar.
  source_aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(source_aliases) = 'array'),
  -- Inventario exacto de fuentes usadas (ids ordenados): mensajes del autor, originales aceptados y extracciones.
  inventory jsonb not null check (jsonb_typeof(inventory) = 'object'),
  evaluated_at timestamptz not null default clock_timestamp(),
  check (char_length(input::text) <= 4000000),
  unique (id, document_id)
);
create index alc_evaluations_document_idx on public.alc_evaluations (document_id, evaluated_at);
select private.make_append_only('public.alc_evaluations');
alter table public.alc_evaluations enable row level security;
revoke all on public.alc_evaluations from public, anon, authenticated, service_role;

alter table public.document_revisions add column alc_evaluation_id uuid;
alter table public.document_revisions
  add constraint document_revisions_alc_fk foreign key (alc_evaluation_id, document_id)
  references public.alc_evaluations (id, document_id) on delete restrict;

-- La evaluación de una revisión no se reasigna (se agrega a las inmutabilidades existentes de 00200).
create or replace function private.revisions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'document_revisions: no se borran' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.document_id is distinct from old.document_id
     or new.sequence is distinct from old.sequence or new.snapshot_id is distinct from old.snapshot_id
     or new.snapshot_hash is distinct from old.snapshot_hash or new.selection is distinct from old.selection
     or new.frozen_from_draft_revision is distinct from old.frozen_from_draft_revision
     or new.supersedes_revision_id is distinct from old.supersedes_revision_id
     or new.alc_evaluation_id is distinct from old.alc_evaluation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'document_revisions: selección, snapshot, evaluación y vínculos son inmutables'
      using errcode = 'restrict_violation';
  end if;
  if old.lifecycle <> 'activa' and new.lifecycle is distinct from old.lifecycle then
    raise exception 'document_revisions: % es terminal', old.lifecycle using errcode = 'restrict_violation';
  end if;
  if old.lifecycle <> 'activa' and new.confirmation_status is distinct from old.confirmation_status then
    raise exception 'document_revisions: estado de confirmación congelado'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

-- Ayudantes privados (postgres, SECURITY DEFINER) ---------------------------------------------------------------------

create function private.alc_valid_selection(sel text[]) returns boolean
language sql immutable set search_path = '' as $$
  select sel in (array['autor', 'comprador'], array['autor', 'intermediario', 'comprador'])
$$;

-- Fuentes realmente usadas del documento. Un original aceptado sin extracción SÍ figura: no se omite en silencio.
create function private.alc_inventory(p_document uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'messages', coalesce((select jsonb_agg(m.id order by m.id) from public.messages m
      where m.document_id = p_document and m.sender = 'autor'), '[]'::jsonb),
    'evidences', coalesce((select jsonb_agg(e.id order by e.id) from public.evidences e
      where e.document_id = p_document and e.upload_state = 'accepted'), '[]'::jsonb),
    'extractions', coalesce((select jsonb_agg(x.id order by x.id) from public.evidence_extractions x
      where x.document_id = p_document), '[]'::jsonb))
$$;

-- Fuente única de la decisión de sellabilidad. `null` = sellable.
create function private.alc_sealability(p_revision uuid, p_check_current boolean) returns text
language plpgsql stable security definer set search_path = '' as $$
declare rev public.document_revisions; ev public.alc_evaluations;
begin
  select * into rev from public.document_revisions where id = p_revision;
  if not found or rev.alc_evaluation_id is null then return 'evaluation_required'; end if;
  select * into ev from public.alc_evaluations where id = rev.alc_evaluation_id;
  if not found then return 'evaluation_required'; end if;
  if p_check_current and ev.inventory is distinct from private.alc_inventory(rev.document_id) then
    return 'stale_evaluation';
  end if;
  if rev.selection is distinct from ev.selection or not private.alc_valid_selection(ev.selection) then
    return 'selection_invalid';
  end if;
  if ev.color = 'rojo' then return 'red'; end if;
  return null;
end
$$;

-- Triggers de respaldo (postgres, SECURITY DEFINER) ---------------------------------------------------------------------

create function private.revisions_require_alc() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev public.alc_evaluations;
begin
  if new.alc_evaluation_id is null then
    raise exception 'alc: la revisión requiere una evaluación' using errcode = 'check_violation';
  end if;
  select * into ev from public.alc_evaluations where id = new.alc_evaluation_id and document_id = new.document_id;
  if not found or ev.selection is distinct from new.selection or ev.draft_revision <> new.frozen_from_draft_revision then
    raise exception 'alc: la evaluación no corresponde a la revisión' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger trg_revisions_require_alc before insert on public.document_revisions
  for each row execute function private.revisions_require_alc();

-- Cada rol responde solo después de que sus antecesores de la misma revisión CONFIRMARON (revisiones con evaluación).
create function private.responses_order_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rev public.document_revisions;
begin
  select * into rev from public.document_revisions where id = new.revision_id;
  if rev.alc_evaluation_id is null then return new; end if;
  if exists (
    select 1 from unnest(rev.selection) s(role)
    where private.role_rank(s.role) < private.role_rank(new.role)
      and not exists (select 1 from public.corroboration_responses x
        where x.revision_id = new.revision_id and x.role = s.role and x.decision = 'confirmada')
  ) then
    raise exception 'confirmation_order' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_responses_order before insert on public.corroboration_responses
  for each row execute function private.responses_order_guard();

-- Publicación: respaldo contra cualquier camino que no pase por `claim_finalization`.
create function private.versions_alc_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  code := private.alc_sealability(new.revision_id, false);
  if code is not null then
    raise exception 'alc_blocked:%', code using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_versions_alc_guard before insert on public.document_versions
  for each row execute function private.versions_alc_guard();

-- Sello: un intento nuevo exige versión sellable. No bloquea la reconciliación (no inserta intentos).
create function private.attempts_alc_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare code text; rev uuid;
begin
  select dv.revision_id into rev from public.document_versions dv where dv.id = new.version_id;
  code := private.alc_sealability(rev, false);
  if code is not null then
    raise exception 'alc_blocked:%', code using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_attempts_alc_guard before insert on public.hedera_attempts
  for each row execute function private.attempts_alc_guard();

revoke all on function private.alc_valid_selection(text[]), private.alc_inventory(uuid), private.alc_sealability(uuid, boolean),
  private.revisions_require_alc(), private.responses_order_guard(), private.versions_alc_guard(), private.attempts_alc_guard()
  from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function private.alc_valid_selection(text[]), private.alc_inventory(uuid), private.alc_sealability(uuid, boolean)
  to galcoa_f7_writer, galcoa_seal_writer;

-- Funciones del escritor F7 (propietario galcoa_f7_writer) -------------------------------------------------------------

grant select, insert on public.alc_evaluations to galcoa_f7_writer;
create policy alc_f7_evaluations on public.alc_evaluations to galcoa_f7_writer using (true) with check (true);

grant create on schema public, private to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
set local role galcoa_f7_writer;

-- Persistencia de la evaluación (solo ejecutor, actor explícito). Bajo lock del documento verifica que el borrador y el
-- inventario sean los vigentes y que el color concuerde con los hallazgos: un color suelto no se acepta.
create function public.save_alc_evaluation(
  p_actor_id uuid, p_document_id uuid, p_draft_revision integer, p_selection text[], p_rules_version text,
  p_input jsonb, p_input_hash text, p_color text, p_result jsonb, p_shared jsonb, p_rectifications jsonb,
  p_source_aliases jsonb, p_inventory jsonb, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.documents; dr public.drafts; eid uuid; findings jsonb; has_red boolean; has_declared boolean; has_match boolean;
  expected text;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_draft_revision is null or p_draft_revision < 0 or p_selection is null
     or p_rules_version is null or char_length(p_rules_version) not between 1 and 64
     or p_input is null or jsonb_typeof(p_input) <> 'object'
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_color is null or p_color not in ('verde', 'amarillo', 'rojo')
     or p_result is null or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result->'findings') is distinct from 'array'
     or p_shared is null or jsonb_typeof(p_shared) <> 'object'
     or p_rectifications is null or jsonb_typeof(p_rectifications) <> 'array'
     or p_source_aliases is null or jsonb_typeof(p_source_aliases) <> 'array'
     or p_inventory is null or jsonb_typeof(p_inventory) <> 'object'
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select * into d from public.documents where id = p_document_id and owner_id = p_actor_id for update;
  if not found or d.document_status = 'finalizado' then return jsonb_build_object('status', 'not_available'); end if;
  select * into dr from public.drafts where document_id = p_document_id for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if dr.draft_revision <> p_draft_revision then return jsonb_build_object('status', 'stale_draft'); end if;
  if not private.alc_valid_selection(p_selection) then return jsonb_build_object('status', 'selection_invalid'); end if;
  if p_inventory is distinct from private.alc_inventory(p_document_id) then
    return jsonb_build_object('status', 'inventory_mismatch');
  end if;
  -- El color debe ser el que implican los hallazgos (precedencia rojo > amarillo > verde, sin umbrales).
  findings := p_result->'findings';
  has_red := exists (select 1 from jsonb_array_elements(findings) f
    where f->>'ruleId' in ('ALC-CONTRADICCION', 'ALC-NO-LECTURA', 'ALC-AMBIGUEDAD', 'ALC-PARTICIPANTES'));
  has_declared := exists (select 1 from jsonb_array_elements(findings) f where f->>'ruleId' = 'ALC-DATO-DECLARADO');
  has_match := exists (select 1 from jsonb_array_elements(findings) f where f->>'ruleId' = 'ALC-FUENTES-COINCIDENTES');
  expected := case when has_red then 'rojo' when has_declared then 'amarillo' when has_match then 'verde' else null end;
  if expected is distinct from p_color or p_result->>'color' is distinct from p_color
     or p_shared->>'color' is distinct from p_color or p_shared->>'rulesVersion' is distinct from p_rules_version
     or p_result->>'rulesVersion' is distinct from p_rules_version
     or exists (select 1 from jsonb_array_elements(p_rectifications) r
       where char_length(btrim(coalesce(r->>'reason', ''))) = 0) then
    return jsonb_build_object('status', 'result_inconsistent');
  end if;
  insert into public.alc_evaluations(document_id, draft_revision, rules_version, selection, input, input_hash, color, result,
      shared, rectifications, source_aliases, inventory)
    values(p_document_id, p_draft_revision, p_rules_version, p_selection, p_input, p_input_hash, p_color, p_result,
      p_shared, p_rectifications, p_source_aliases, p_inventory)
    returning id into eid;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, p_actor_id::text, 'alc.evaluated', 'alc_evaluation', eid, 'ok',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'color', p_color, 'rulesVersion', p_rules_version,
        'rectifications', jsonb_array_length(p_rectifications)));
  return jsonb_build_object('status', 'saved', 'evaluationId', eid);
end
$$;

create function public.get_alc_evaluation(p_actor_id uuid, p_document_id uuid, p_evaluation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.alc_evaluations;
begin
  if p_actor_id is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_evaluation_id is null then raise invalid_parameter_value; end if;
  select e.* into ev from public.alc_evaluations e join public.documents d on d.id = e.document_id
    where e.id = p_evaluation_id and e.document_id = p_document_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  return jsonb_build_object('status', 'found', 'evaluation', jsonb_build_object(
    'evaluationId', ev.id, 'draftRevision', ev.draft_revision, 'rulesVersion', ev.rules_version,
    'selection', to_jsonb(ev.selection), 'inputHash', ev.input_hash, 'color', ev.color, 'shared', ev.shared,
    'rectifications', ev.rectifications, 'sourceAliases', ev.source_aliases));
end
$$;

-- Congelar v2: la firma antigua (que aceptaba `p_control_status` del llamador) se RETIRA.
drop function public.freeze_revision(uuid, integer, text, text, jsonb, text, text, text);

create function public.freeze_revision(
  p_document_id uuid, p_expected_draft_revision integer, p_canonical_hex text, p_evaluation_id uuid,
  p_sources jsonb, p_key text, p_fingerprint text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; dr public.drafts; cur public.document_revisions;
  prior public.idempotency_records; ev public.alc_evaluations; ctl text;
  bytes bytea; content jsonb; hash text; sel text[]; rid uuid := gen_random_uuid(); sid uuid := gen_random_uuid();
  role_name text; src jsonb; invalidated integer := 0; seq integer;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_expected_draft_revision is null or p_expected_draft_revision < 0
     or p_canonical_hex is null or p_canonical_hex !~ '^([0-9a-f]{2})+$' or char_length(p_canonical_hex) > 524288
     or p_evaluation_id is null
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

  -- La evaluación debe ser de este documento, de este borrador y del inventario vigente; el control documental se deriva
  -- de ella, nunca del llamador.
  select * into ev from public.alc_evaluations where id = p_evaluation_id and document_id = p_document_id;
  if not found then return jsonb_build_object('status', 'evaluation_not_found'); end if;
  if ev.draft_revision <> p_expected_draft_revision or ev.inventory is distinct from private.alc_inventory(p_document_id) then
    return jsonb_build_object('status', 'stale_evaluation');
  end if;
  ctl := case ev.color when 'rojo' then 'contradiccion_critica' when 'amarillo' then 'con_advertencias'
    else 'sin_inconsistencias_criticas_detectadas' end;

  bytes := decode(p_canonical_hex, 'hex');
  content := convert_from(bytes, 'UTF8')::jsonb;
  hash := encode(sha256(bytes), 'hex');
  -- Contenido compartido v2: operación del borrador vigente + advertencias + selección + evaluación + rectificaciones.
  if jsonb_typeof(content) <> 'object'
     or (content - 'operation' - 'warnings' - 'selection' - 'alc' - 'rectifications') <> '{}'::jsonb
     or not (content ? 'operation' and content ? 'warnings' and content ? 'selection' and content ? 'alc' and content ? 'rectifications')
     or jsonb_typeof(content->'warnings') <> 'array' or jsonb_typeof(content->'selection') <> 'array'
     or content->'operation' is distinct from dr.content
     or content->'alc' is distinct from ev.shared
     or content->'rectifications' is distinct from ev.rectifications
     or content->'selection' is distinct from to_jsonb(ev.selection) then
    raise invalid_parameter_value;
  end if;
  sel := ev.selection;

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
  insert into public.document_revisions(id, document_id, sequence, snapshot_id, snapshot_hash, selection,
      frozen_from_draft_revision, supersedes_revision_id, control_status, alc_evaluation_id)
    values(rid, p_document_id, seq, sid, hash, sel, p_expected_draft_revision, cur.id, ctl, ev.id);
  insert into public.revision_snapshots(id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
    values(sid, p_document_id, rid, 2, bytes, hash, content);
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
    control_status = ctl, updated_at = clock_timestamp() where id = p_document_id;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(p_document_id, actor::text, 'revision.frozen', 'revision', rid, 'ok',
      jsonb_build_object('schemaVersion', 2, 'correlationId', p_correlation_id, 'color', ev.color,
        'rectifications', jsonb_array_length(ev.rectifications)));
  insert into public.idempotency_records(actor_scope, resource_id, action, key, fingerprint, result)
    values(actor::text, p_document_id, 'revision.freeze', p_key, p_fingerprint, jsonb_build_object('revisionId', rid));
  return jsonb_build_object('status', 'created', 'value', private.f7_bundle_json(rid),
    'supersededRevisionId', cur.id, 'invalidatedInvitations', invalidated);
end
$$;

-- El DTO del snapshot refleja su versión real (1 histórico, 2 con evaluación). El resto de claves queda intacto.
create or replace function private.f7_bundle_json(p_revision uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'revision', private.f7_revision_json(r),
    'snapshot', jsonb_build_object('schemaVersion', s.schema_version, 'snapshotId', s.id, 'revisionId', r.id, 'documentId', r.document_id,
      'content', s.content, 'snapshotHash', s.snapshot_hash, 'frozenAt', private.f7_ts(s.frozen_at)))
  from public.document_revisions r join public.revision_snapshots s on s.revision_id = r.id
  where r.id = p_revision
$$;

-- Reclamo de finalización con guarda ALC: antes de reanudar una operación sin publicar y antes de reservar una nueva.
-- Un bloqueo se audita y devuelve `blocked` + código; no hay "aprobar igual".
create or replace function public.claim_finalization(
  p_document_id uuid, p_revision_id uuid, p_renderer text, p_lease_seconds integer, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; rev public.document_revisions; dr public.drafts;
  op public.finalization_operations; next_number integer; prev uuid; agg text; lease timestamptz; code text;
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
    -- Reanudación: la revisión ya es inmutable, así que no se exige inventario vigente (evita una operación fijada sin salida).
    code := private.alc_sealability(rev.id, false);
    if code is not null then
      insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
        values(p_document_id, actor::text, 'finalization.blocked', 'finalization', op.id, 'rechazado',
          jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'code', code, 'stage', 'resume'));
      return jsonb_build_object('status', 'blocked', 'code', code);
    end if;
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
  -- Reclamo nuevo: evaluación existente, vigente (inventario), selección válida y no roja.
  code := private.alc_sealability(rev.id, true);
  if code is not null then
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(p_document_id, actor::text, 'finalization.blocked', 'revision', rev.id, 'rechazado',
        jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'code', code, 'stage', 'claim'));
    return jsonb_build_object('status', 'blocked', 'code', code);
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

-- Manifiesto privado: el detalle v2 compromete la evaluación ALC (id, reglas, color y huella del insumo). Mismas firmas,
-- propietario y grants que 02509 (create or replace los conserva); una revisión histórica sigue con el detalle v1.
create or replace function public.get_finalization_manifest_input(p_actor_id uuid, p_operation_id uuid, p_fencing bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  op public.finalization_operations; rev public.document_revisions;
  pdf public.artifact_staging; mf public.artifact_staging;
  evs jsonb; reps jsonb; confs jsonb; prev jsonb; alcj jsonb;
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

  select jsonb_build_object('evaluationId', e.id, 'rulesVersion', e.rules_version, 'color', e.color, 'inputHash', e.input_hash) into alcj
    from public.alc_evaluations e where e.id = rev.alc_evaluation_id;

  return jsonb_build_object('status', 'ready', 'operationId', op.id, 'phase', op.phase,
    'versionId', op.reserved_version_id, 'revisionId', op.revision_id, 'snapshotId', op.snapshot_id,
    'snapshotHash', op.snapshot_hash, 'publicReference', op.public_reference, 'nonce', encode(op.nonce, 'hex'),
    'pdf', jsonb_build_object('sha256', pdf.sha256, 'byteLength', pdf.byte_length),
    'evidences', evs, 'reports', reps, 'alc', alcj, 'confirmations', confs, 'previousVersion', prev,
    'staged', case when mf.id is null then null else jsonb_build_object('sha256', mf.sha256, 'byteLength', mf.byte_length) end);
end
$$;

create or replace function public.prepare_finalization_manifest(p_actor_id uuid, p_operation_id uuid, p_fencing bigint, p_detail bytea, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  doc uuid; op public.finalization_operations; pdf public.artifact_staging; mf public.artifact_staging;
  digest text; detail jsonb; rev public.document_revisions; alcv public.alc_evaluations; v2 boolean := false;
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
  -- Revisión con evaluación ALC: detalle v2 que la repite. Revisión histórica: v1 sin alc.
  select * into rev from public.document_revisions where id = op.revision_id;
  if rev.alc_evaluation_id is not null then
    select * into alcv from public.alc_evaluations where id = rev.alc_evaluation_id;
    v2 := true;
  end if;
  if detail->>'schemaVersion' is distinct from (case when v2 then 'galcoa.private-detail.v2' else 'galcoa.private-detail.v1' end)
     or (v2 and (detail#>>'{alc,evaluationId}' is distinct from alcv.id::text or detail#>>'{alc,inputHash}' is distinct from alcv.input_hash
       or detail#>>'{alc,color}' is distinct from alcv.color or detail#>>'{alc,rulesVersion}' is distinct from alcv.rules_version))
     or (not v2 and detail ? 'alc')
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

revoke all on function public.save_alc_evaluation(uuid, uuid, integer, text[], text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text),
  public.get_alc_evaluation(uuid, uuid, uuid),
  public.freeze_revision(uuid, integer, text, uuid, jsonb, text, text, text)
  from public, anon, authenticated, service_role, galcoa_executor;
-- Solo el ejecutor persiste y lee evaluaciones; el propietario congela con su sesión (sin colores sueltos: la evaluación
-- se resuelve por id dentro de la función).
grant execute on function public.save_alc_evaluation(uuid, uuid, integer, text[], text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text),
  public.get_alc_evaluation(uuid, uuid, uuid) to galcoa_executor;
grant execute on function public.freeze_revision(uuid, integer, text, uuid, jsonb, text, text, text) to authenticated;
reset role;
revoke create on schema public, private from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;

-- Funciones del escritor del sello (propietario galcoa_seal_writer) -------------------------------------------------------

grant create on schema public to galcoa_seal_writer;
grant galcoa_seal_writer to postgres with set true;
set local role galcoa_seal_writer;

-- Elegibilidad previa a un envío nuevo. Un bloqueo se persiste en auditoría y devuelve un resultado estructurado.
create function public.check_seal_eligibility(p_actor_id uuid, p_version_id uuid, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.document_versions; code text;
begin
  if p_actor_id is null or p_version_id is null or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select dv.* into v from public.document_versions dv join public.documents d on d.id = dv.document_id
    where dv.id = p_version_id and d.owner_id = p_actor_id;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  code := private.alc_sealability(v.revision_id, false);
  if code is null then return jsonb_build_object('status', 'allowed'); end if;
  if code = 'evaluation_required' then code := 'legacy_without_alc'; end if;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(v.document_id, p_actor_id::text, 'seal.blocked', 'document_version', v.id, 'rechazado',
      jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'code', code));
  return jsonb_build_object('status', 'blocked', 'code', code);
end
$$;

-- `record_seal_intent` con la misma firma y propietario de 02507, más la guarda ALC antes de crear el intento. Un intento
-- ya activo o un registro existente se informan igual que antes (la reconciliación no se bloquea).
create or replace function public.record_seal_intent(p_actor_id uuid, p_version_id uuid, p_payload bytea, p_payload_hash text,
  p_signed_bytes bytea, p_transaction_id text, p_valid_start timestamptz, p_valid_until timestamptz, p_topic_id text,
  p_network text, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.document_versions; prev_fencing bigint; prev_hash text; fence bigint; aid uuid; code text;
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
  perform pg_advisory_xact_lock(hashtextextended('seal:' || p_version_id::text, 0));
  if exists (select 1 from public.hedera_registrations where version_id = p_version_id) then
    return jsonb_build_object('status', 'registered');
  end if;
  if exists (select 1 from public.hedera_attempts where version_id = p_version_id and outcome in ('pendiente', 'incierto')) then
    return jsonb_build_object('status', 'active_attempt');
  end if;
  code := private.alc_sealability(v.revision_id, false);
  if code is not null then
    if code = 'evaluation_required' then code := 'legacy_without_alc'; end if;
    insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
      values(v.document_id, p_actor_id::text, 'seal.blocked', 'document_version', v.id, 'rechazado',
        jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id, 'code', code, 'stage', 'intent'));
    return jsonb_build_object('status', 'blocked', 'code', code);
  end if;
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

revoke all on function public.check_seal_eligibility(uuid, uuid, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.check_seal_eligibility(uuid, uuid, text) to galcoa_executor;
reset role;
revoke create on schema public from galcoa_seal_writer;
grant galcoa_seal_writer to postgres with set false, inherit false;
