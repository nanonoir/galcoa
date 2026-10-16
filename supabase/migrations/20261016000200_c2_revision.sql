-- C2 revisión (MVP-022/023): revisiones, snapshots, participantes, solicitudes y
-- respuestas. Revisiones ≠ versiones. Las FK compuestas impiden mezclar
-- documento/revisión/snapshot/hash/participante (data-transactions §1).

-- Orden canónico de roles: autor, intermediario, comprador.
create function private.role_rank(role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role when 'autor' then 1 when 'intermediario' then 2 when 'comprador' then 3 end
$$;

-- Revisiones ------------------------------------------------------------------------

create table public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  sequence integer not null check (sequence > 0),
  snapshot_id uuid not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  -- Una de las cuatro selecciones, siempre con autor y en orden canónico.
  selection text[] not null check (selection in (
    array['autor'], array['autor', 'intermediario'], array['autor', 'comprador'],
    array['autor', 'intermediario', 'comprador'])),
  frozen_from_draft_revision integer not null check (frozen_from_draft_revision >= 0),
  supersedes_revision_id uuid,
  lifecycle text not null default 'activa' check (lifecycle in ('activa', 'sustituida', 'finalizada')),
  confirmation_status text not null default 'pendiente' check (confirmation_status in (
    'pendiente', 'parcial', 'completa', 'rechazada', 'sustituida')),
  control_status text not null default 'sin_evaluar' check (control_status in (
    'sin_evaluar', 'con_advertencias', 'contradiccion_critica',
    'sin_inconsistencias_criticas_detectadas')),
  created_at timestamptz not null default now(),
  unique (document_id, sequence),
  unique (id, document_id),
  unique (id, document_id, snapshot_id, snapshot_hash),
  foreign key (supersedes_revision_id, document_id) references public.document_revisions (id, document_id)
    on delete restrict
);
-- Sustitución lineal: una revisión sustituye como mucho a una anterior y solo una vez.
create unique index document_revisions_supersedes_uidx
  on public.document_revisions (supersedes_revision_id) where supersedes_revision_id is not null;

create table public.revision_snapshots (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null,
  schema_version integer not null check (schema_version > 0),
  canonical_bytes bytea not null check (octet_length(canonical_bytes) > 0),
  snapshot_hash text not null,
  -- JSON compartible completo; debe concordar con los bytes canónicos y el hash.
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  frozen_at timestamptz not null default now(),
  check (snapshot_hash = encode(sha256(canonical_bytes), 'hex')),
  check (content = convert_from(canonical_bytes, 'UTF8')::jsonb),
  unique (revision_id),
  unique (id, document_id, revision_id, snapshot_hash),
  -- Referencias circulares con la revisión: se verifican al commit (misma transacción).
  foreign key (revision_id, document_id) references public.document_revisions (id, document_id)
    on delete restrict deferrable initially deferred
);
select private.make_append_only('public.revision_snapshots');

alter table public.document_revisions
  add constraint document_revisions_snapshot_fk
  foreign key (snapshot_id, document_id, id, snapshot_hash)
  references public.revision_snapshots (id, document_id, revision_id, snapshot_hash)
  on delete restrict deferrable initially deferred;

-- Selección, snapshot y vínculo no se editan; el ciclo de vida solo avanza.
create function private.revisions_guard()
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
     or new.created_at is distinct from old.created_at then
    raise exception 'document_revisions: selección, snapshot y vínculos son inmutables'
      using errcode = 'restrict_violation';
  end if;
  if old.lifecycle <> 'activa' and new.lifecycle is distinct from old.lifecycle then
    raise exception 'document_revisions: % es terminal', old.lifecycle using errcode = 'restrict_violation';
  end if;
  if old.lifecycle <> 'activa' and new.confirmation_status is distinct from old.confirmation_status then
    -- La consolidación final de una revisión sustituida/finalizada ya no cambia.
    raise exception 'document_revisions: estado de confirmación congelado'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_revisions_guard before update or delete on public.document_revisions
  for each row execute function private.revisions_guard();
create trigger trg_revisions_no_truncate before truncate on public.document_revisions
  for each statement execute function private.forbid_mutation();

-- Punteros del documento: FK compuestas al mismo documento, verificadas al commit.
alter table public.documents
  add constraint documents_active_revision_fk
  foreign key (active_revision_id, id) references public.document_revisions (id, document_id)
  on delete restrict deferrable initially deferred;

-- Participantes fijos por revisión ----------------------------------------------------

create table public.revision_participants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null,
  snapshot_id uuid not null,
  snapshot_hash text not null,
  role text not null check (role in ('autor', 'intermediario', 'comprador')),
  -- El autor enlaza al propietario del documento, no a un nombre del request.
  user_id uuid,
  created_at timestamptz not null default now(),
  check ((role = 'autor') = (user_id is not null)),
  unique (revision_id, role),
  unique (id, document_id, revision_id, snapshot_id, snapshot_hash, role),
  foreign key (revision_id, document_id, snapshot_id, snapshot_hash)
    references public.document_revisions (id, document_id, snapshot_id, snapshot_hash)
    on delete restrict deferrable initially deferred,
  foreign key (document_id, user_id) references public.documents (id, owner_id) on delete restrict
);
select private.make_append_only('public.revision_participants');

-- Conjunto completo: los roles de la revisión coinciden con su selección (diferido).
create function private.check_revision_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rev_id uuid;
  expected text[];
  actual text[];
begin
  if tg_table_name = 'document_revisions' then
    rev_id := new.id;
  else
    rev_id := new.revision_id;
  end if;
  select selection into expected from public.document_revisions where id = rev_id;
  select array_agg(role order by private.role_rank(role)) into actual
    from public.revision_participants where revision_id = rev_id;
  if expected is distinct from actual then
    raise exception 'La revisión % debe tener exactamente los participantes de su selección', rev_id
      using errcode = 'check_violation';
  end if;
  return null;
end
$$;
create constraint trigger trg_revision_participants_set
  after insert on public.document_revisions
  deferrable initially deferred for each row execute function private.check_revision_participants();
create constraint trigger trg_participants_set
  after insert on public.revision_participants
  deferrable initially deferred for each row execute function private.check_revision_participants();

-- Mapeo privado alias → fuente (el snapshot no contiene PK ni URLs) ----------------------

create table public.snapshot_sources (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  snapshot_id uuid not null,
  revision_id uuid not null,
  snapshot_hash text not null,
  alias text not null check (char_length(alias) > 0),
  message_id uuid,
  evidence_id uuid,
  report_id uuid,
  page integer check (page > 0),
  check (num_nonnulls(message_id, evidence_id, report_id) = 1),
  unique (snapshot_id, alias),
  foreign key (snapshot_id, document_id, revision_id, snapshot_hash)
    references public.revision_snapshots (id, document_id, revision_id, snapshot_hash) on delete restrict,
  foreign key (message_id, document_id) references public.messages (id, document_id) on delete restrict,
  foreign key (evidence_id, document_id) references public.evidences (id, document_id) on delete restrict,
  foreign key (report_id, document_id) references public.verification_reports (id, document_id) on delete restrict
);
select private.make_append_only('public.snapshot_sources');

-- Solicitudes de corroboración (capacidad individual de un tercero) -----------------------

create table public.corroboration_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null,
  snapshot_id uuid not null,
  snapshot_hash text not null,
  participant_id uuid not null,
  role text not null check (role in ('intermediario', 'comprador')),
  -- Solo el hash del token; nunca en claro. El hash también es una capacidad: no se expone.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  generation integer not null check (generation > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (participant_id, generation),
  unique (id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id),
  foreign key (participant_id, document_id, revision_id, snapshot_id, snapshot_hash, role)
    references public.revision_participants (id, document_id, revision_id, snapshot_id, snapshot_hash, role)
    on delete restrict
);
-- Una generación vigente por participante; el historial de generaciones se conserva.
create unique index corroboration_requests_live_uidx
  on public.corroboration_requests (participant_id) where revoked_at is null;

create function private.requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'corroboration_requests: no se borran' using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id or new.document_id is distinct from old.document_id
     or new.revision_id is distinct from old.revision_id or new.snapshot_id is distinct from old.snapshot_id
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.participant_id is distinct from old.participant_id or new.role is distinct from old.role
     or new.token_hash is distinct from old.token_hash or new.generation is distinct from old.generation
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
    raise exception 'corroboration_requests: solo revocación y consumo son mutables'
      using errcode = 'restrict_violation';
  end if;
  if (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
     or (old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at) then
    raise exception 'corroboration_requests: revocación y consumo son definitivos'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_requests_guard before update or delete on public.corroboration_requests
  for each row execute function private.requests_guard();
create trigger trg_requests_no_truncate before truncate on public.corroboration_requests
  for each statement execute function private.forbid_mutation();

-- Respuestas (autor y terceros) --------------------------------------------------------

create table public.corroboration_responses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null,
  snapshot_id uuid not null,
  snapshot_hash text not null,
  participant_id uuid not null,
  role text not null check (role in ('autor', 'intermediario', 'comprador')),
  request_id uuid,
  decision text not null check (decision in ('confirmada', 'rechazada')),
  checkbox_checked boolean not null,
  ratified_rejection boolean not null,
  -- Nombre autodeclarado (no identidad verificada); obligatorio para terceros, también al rechazar.
  declared_name text,
  responded_at timestamptz not null default now(),
  -- Confirmar: casilla marcada sin ratificación; rechazar: casilla desmarcada y ratificada (INV-13).
  check ((decision = 'confirmada' and checkbox_checked and not ratified_rejection)
      or (decision = 'rechazada' and not checkbox_checked and ratified_rejection)),
  check (declared_name is null or char_length(btrim(declared_name)) between 1 and 200),
  check (role = 'autor' or declared_name is not null),
  -- El autor responde desde sesión (sin solicitud); un tercero, con su solicitud.
  check ((role = 'autor') = (request_id is null)),
  unique (revision_id, participant_id),
  unique (request_id),
  unique (id, revision_id),
  foreign key (participant_id, document_id, revision_id, snapshot_id, snapshot_hash, role)
    references public.revision_participants (id, document_id, revision_id, snapshot_id, snapshot_hash, role)
    on delete restrict,
  foreign key (request_id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id)
    references public.corroboration_requests (id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id)
    on delete restrict
);
select private.make_append_only('public.corroboration_responses');

alter table public.document_revisions enable row level security;
alter table public.revision_snapshots enable row level security;
alter table public.revision_participants enable row level security;
alter table public.snapshot_sources enable row level security;
alter table public.corroboration_requests enable row level security;
alter table public.corroboration_responses enable row level security;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
