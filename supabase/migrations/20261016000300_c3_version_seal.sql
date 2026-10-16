-- C3 versión y sello (MVP-022/023): finalización durable con fencing, staging de
-- artefactos, versiones inmutables, constancias y registros/intentos HCS
-- (data-transactions §1, §5, §6; manifest-hcs). No incluye RPC: cada tarea
-- consumidora (MVP-080+) trae su migración aditiva.

-- Solo las respuestas confirmadas pueden ser constancias de una versión.
alter table public.corroboration_responses
  add constraint corroboration_responses_confirmed_key unique (id, revision_id, decision);

-- Operación de finalización (registro técnico no final) ---------------------------------

create table public.finalization_operations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null unique,
  snapshot_id uuid not null,
  snapshot_hash text not null,
  -- Reservados al reclamar bajo lock del documento (nunca provisionales en document_versions).
  reserved_version_id uuid not null unique,
  version_number integer not null check (version_number > 0),
  previous_version_id uuid,
  renderer text not null check (char_length(renderer) > 0),
  public_reference text not null unique check (char_length(public_reference) > 0),
  -- Nonce privado del manifiesto; nunca se proyecta fuera del propietario técnico.
  nonce bytea not null check (octet_length(nonce) >= 16),
  phase text not null default 'reserved' check (phase in (
    'reserved', 'pdf_staged', 'manifest_ready', 'object_checked', 'published')),
  status text not null default 'active' check (status in ('active', 'abandoned')),
  fencing bigint not null default 1 check (fencing > 0),
  lease_expires_at timestamptz not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (id, document_id),
  unique (id, document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id, version_number),
  foreign key (revision_id, document_id, snapshot_id, snapshot_hash)
    references public.document_revisions (id, document_id, snapshot_id, snapshot_hash) on delete restrict
);

create function private.phase_rank(phase text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case phase when 'reserved' then 1 when 'pdf_staged' then 2 when 'manifest_ready' then 3
    when 'object_checked' then 4 when 'published' then 5 end
$$;

create function private.finalization_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  step integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'finalization_operations: no se borran' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.document_id is distinct from old.document_id
     or new.revision_id is distinct from old.revision_id or new.snapshot_id is distinct from old.snapshot_id
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.reserved_version_id is distinct from old.reserved_version_id
     or new.version_number is distinct from old.version_number
     or new.previous_version_id is distinct from old.previous_version_id
     or new.renderer is distinct from old.renderer or new.public_reference is distinct from old.public_reference
     or new.nonce is distinct from old.nonce or new.created_at is distinct from old.created_at then
    raise exception 'finalization_operations: las entradas reservadas son inmutables'
      using errcode = 'restrict_violation';
  end if;
  if old.phase = 'published' then
    raise exception 'finalization_operations: una operación publicada es terminal'
      using errcode = 'restrict_violation';
  end if;
  step := private.phase_rank(new.phase) - private.phase_rank(old.phase);
  if step not in (0, 1) then
    raise exception 'finalization_operations: la fase es monotónica y avanza de a una'
      using errcode = 'restrict_violation';
  end if;
  if new.fencing < old.fencing then
    raise exception 'finalization_operations: el fencing no retrocede' using errcode = 'restrict_violation';
  end if;
  if old.status = 'abandoned' and new.status = 'active' and new.fencing <= old.fencing then
    raise exception 'finalization_operations: reanudar exige un fencing nuevo'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_finalization_guard before update or delete on public.finalization_operations
  for each row execute function private.finalization_guard();
create trigger trg_finalization_no_truncate before truncate on public.finalization_operations
  for each statement execute function private.forbid_mutation();

-- Staging de bytes canónicos y reservas de objeto privado --------------------------------

create table public.artifact_staging (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.finalization_operations (id) on delete restrict,
  kind text not null check (kind in ('pdf', 'manifest')),
  content bytea not null check (octet_length(content) > 0),
  -- Hash y longitud derivados de los bytes, no confiados al request.
  sha256 text not null,
  byte_length bigint not null,
  created_at timestamptz not null default now(),
  check (sha256 = encode(sha256(content), 'hex')),
  check (byte_length = octet_length(content)),
  unique (operation_id, kind)
);
create trigger trg_staging_no_update before update on public.artifact_staging
  for each row execute function private.forbid_update();

create table public.artifact_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  document_id uuid not null,
  kind text not null check (kind in ('pdf', 'manifest')),
  fencing bigint not null check (fencing > 0),
  bucket text not null default 'versions-private' check (bucket = 'versions-private'),
  -- Nombre opaco por documento/artefacto/fencing; el prefijo no prueba propiedad.
  object_path text not null unique check (char_length(object_path) > 0),
  state text not null default 'active' check (state in ('active', 'superseded', 'adopted', 'abandoned')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (operation_id, kind, fencing),
  foreign key (operation_id, document_id) references public.finalization_operations (id, document_id)
    on delete restrict
);

create function private.reservations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'artifact_reservations: no se borran' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.operation_id is distinct from old.operation_id
     or new.document_id is distinct from old.document_id or new.kind is distinct from old.kind
     or new.fencing is distinct from old.fencing or new.bucket is distinct from old.bucket
     or new.object_path is distinct from old.object_path or new.created_at is distinct from old.created_at then
    raise exception 'artifact_reservations: solo el estado y el vencimiento son mutables'
      using errcode = 'restrict_violation';
  end if;
  if old.state in ('adopted', 'abandoned', 'superseded') and new.state is distinct from old.state then
    raise exception 'artifact_reservations: % es terminal', old.state using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_reservations_guard before update or delete on public.artifact_reservations
  for each row execute function private.reservations_guard();

-- Versiones finalizadas (solo registros publicados; inmutables) ---------------------------

create table public.document_versions (
  id uuid primary key,
  document_id uuid not null references public.documents (id) on delete restrict,
  operation_id uuid not null unique,
  revision_id uuid not null unique,
  snapshot_id uuid not null,
  snapshot_hash text not null,
  version_number integer not null check (version_number > 0),
  previous_version_id uuid unique,
  public_reference text not null unique check (char_length(public_reference) > 0),
  schema_version integer not null check (schema_version > 0),
  -- Envelope público (allowlist) y hash del manifiesto privado.
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  finalized_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (id, document_id),
  unique (id, revision_id),
  foreign key (revision_id, document_id, snapshot_id, snapshot_hash)
    references public.document_revisions (id, document_id, snapshot_id, snapshot_hash) on delete restrict,
  -- Debe coincidir con la reserva exacta (revisión, snapshot, número y versión reservada).
  foreign key (operation_id, document_id, revision_id, snapshot_id, snapshot_hash, id, version_number)
    references public.finalization_operations
      (id, document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id, version_number)
    on delete restrict,
  foreign key (previous_version_id, document_id) references public.document_versions (id, document_id)
    on delete restrict
);
-- Un único primer elemento por documento; sucesor único de cada antecedente (unique arriba).
create unique index document_versions_first_uidx
  on public.document_versions (document_id) where previous_version_id is null;
select private.make_append_only('public.document_versions');

alter table public.finalization_operations
  add constraint finalization_operations_previous_fk
  foreign key (previous_version_id, document_id) references public.document_versions (id, document_id)
  on delete restrict;

-- Los números pueden tener huecos, pero la cadena avanza: el antecedente es menor.
create function private.versions_chain_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prev_number integer;
  reserved_previous uuid;
begin
  select previous_version_id into reserved_previous
    from public.finalization_operations where id = new.operation_id;
  if reserved_previous is distinct from new.previous_version_id then
    raise exception 'document_versions: el antecedente debe ser el reservado por la operación'
      using errcode = 'check_violation';
  end if;
  if new.previous_version_id is not null then
    select version_number into prev_number from public.document_versions where id = new.previous_version_id;
    if prev_number is null or prev_number >= new.version_number then
      raise exception 'document_versions: el antecedente debe tener un número menor'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
create trigger trg_versions_chain before insert on public.document_versions
  for each row execute function private.versions_chain_check();

alter table public.documents
  add constraint documents_last_version_fk
  foreign key (last_version_id, id) references public.document_versions (id, document_id)
  on delete restrict deferrable initially deferred;

create table public.version_receipts (
  version_id uuid not null,
  response_id uuid not null unique,
  revision_id uuid not null,
  decision text not null default 'confirmada' check (decision = 'confirmada'),
  primary key (version_id, response_id),
  foreign key (version_id, revision_id) references public.document_versions (id, revision_id)
    on delete restrict,
  foreign key (response_id, revision_id, decision)
    references public.corroboration_responses (id, revision_id, decision) on delete restrict
);
select private.make_append_only('public.version_receipts');

create table public.version_artifacts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.document_versions (id) on delete restrict,
  kind text not null check (kind in ('pdf', 'manifest')),
  bucket text not null default 'versions-private' check (bucket = 'versions-private'),
  object_path text not null unique check (char_length(object_path) > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint not null check (byte_length > 0),
  unique (version_id, kind)
);
select private.make_append_only('public.version_artifacts');

-- Intentos y registros HCS (separados de la versión) -----------------------------------

create table public.hedera_attempts (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.document_versions (id) on delete restrict,
  -- Intención exacta (payload opaco: solo hash e identificadores) y bytes firmados privados.
  payload bytea not null check (octet_length(payload) > 0),
  payload_hash text not null,
  signed_bytes bytea,
  transaction_id text,
  valid_start timestamptz,
  valid_until timestamptz,
  claim_fencing bigint not null default 1 check (claim_fencing > 0),
  claim_expires_at timestamptz,
  outcome text not null default 'pendiente' check (outcome in ('pendiente', 'registrado', 'fallido', 'incierto')),
  observation jsonb check (observation is null or jsonb_typeof(observation) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payload_hash = encode(sha256(payload), 'hex')),
  unique (id, version_id, payload_hash)
);
-- Un intento activo por versión.
create unique index hedera_attempts_active_uidx
  on public.hedera_attempts (version_id) where outcome in ('pendiente', 'incierto');

create function private.hedera_attempts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'hedera_attempts: no se borran' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.version_id is distinct from old.version_id
     or new.payload is distinct from old.payload or new.payload_hash is distinct from old.payload_hash
     or new.created_at is distinct from old.created_at then
    raise exception 'hedera_attempts: intención inmutable' using errcode = 'restrict_violation';
  end if;
  if old.outcome in ('registrado', 'fallido') and new.outcome is distinct from old.outcome then
    raise exception 'hedera_attempts: % es terminal', old.outcome using errcode = 'restrict_violation';
  end if;
  if new.claim_fencing < old.claim_fencing then
    raise exception 'hedera_attempts: el fencing no retrocede' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_hedera_attempts_guard before update or delete on public.hedera_attempts
  for each row execute function private.hedera_attempts_guard();
create trigger trg_hedera_attempts_no_truncate before truncate on public.hedera_attempts
  for each statement execute function private.forbid_mutation();

create table public.hedera_registrations (
  id uuid primary key default gen_random_uuid(),
  -- Un registro probado por versión.
  version_id uuid not null unique,
  attempt_id uuid not null,
  payload_hash text not null,
  network text not null check (network = 'testnet'),
  topic_id text not null check (char_length(topic_id) > 0),
  topic_epoch text,
  transaction_id text not null check (char_length(transaction_id) > 0),
  sequence_number bigint not null check (sequence_number > 0),
  consensus_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (attempt_id, version_id, payload_hash)
    references public.hedera_attempts (id, version_id, payload_hash) on delete restrict
);
select private.make_append_only('public.hedera_registrations');

alter table public.finalization_operations enable row level security;
alter table public.artifact_staging enable row level security;
alter table public.artifact_reservations enable row level security;
alter table public.document_versions enable row level security;
alter table public.version_receipts enable row level security;
alter table public.version_artifacts enable row level security;
alter table public.hedera_attempts enable row level security;
alter table public.hedera_registrations enable row level security;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
