-- C1 núcleo (MVP-022/023): documentos, mensajes, evidencias, borradores,
-- reportes, auditoría e idempotencia. Diseño: docs/design/data-transactions.md §1.
--
-- Postura de seguridad (aplica a todo `public`):
--  * RLS habilitado en cada tabla; sin DML para `anon`/`authenticated`/`service_role`.
--  * Las escrituras nacen con las RPC de cada tarea consumidora (migraciones aditivas).
--  * Lectura propietaria únicamente por política (migración de RLS/Storage).
--  * Funciones: `search_path` vacío, nombres cualificados, sin EXECUTE para PUBLIC.

-- Rol del ejecutor de servidor: sin login, sin bypass; los grants llegan con cada RPC.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'galcoa_executor') then
    create role galcoa_executor nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- Ningún objeto nuevo de `public` hereda grants de Supabase para roles de API.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role, public;

-- Esquema privado: ayudantes que NO se exponen como RPC (la API solo publica `public`).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- Global (no por esquema): quita el EXECUTE implícito de PUBLIC en toda función nueva.
alter default privileges for role postgres revoke execute on functions from public;

-- Guardas genéricas de inmutabilidad ------------------------------------------------

create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La tabla % es solo-agregar: % rechazado', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end
$$;

create function private.forbid_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las filas de % son inmutables: UPDATE rechazado', tg_table_name
    using errcode = 'restrict_violation';
end
$$;

-- Aplica la guarda solo-agregar (UPDATE, DELETE y TRUNCATE) a una tabla.
create function private.make_append_only(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger %I before update or delete on %s for each row execute function private.forbid_mutation()',
    'trg_append_only', target);
  execute format(
    'create trigger %I before truncate on %s for each statement execute function private.forbid_mutation()',
    'trg_no_truncate', target);
end
$$;

-- Documentos ------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  title text not null check (char_length(btrim(title)) > 0),
  document_status text not null default 'borrador' check (document_status in (
    'borrador', 'listo_para_revision', 'esperando_confirmaciones',
    'revision_rechazada', 'revision_sustituida', 'finalizado')),
  control_status text not null default 'sin_evaluar' check (control_status in (
    'sin_evaluar', 'con_advertencias', 'contradiccion_critica',
    'sin_inconsistencias_criticas_detectadas')),
  -- Punteros: FK compuestas al mismo documento se añaden en C2/C3.
  active_revision_id uuid,
  last_version_id uuid,
  message_seq integer not null default 0 check (message_seq >= 0),
  revision_seq integer not null default 0 check (revision_seq >= 0),
  version_seq integer not null default 0 check (version_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index documents_owner_idx on public.documents (owner_id, updated_at desc);

create function private.documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'documents: id, propietario y creación son inmutables'
      using errcode = 'restrict_violation';
  end if;
  if new.message_seq < old.message_seq or new.revision_seq < old.revision_seq
     or new.version_seq < old.version_seq then
    raise exception 'documents: los contadores solo crecen'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_documents_guard before update on public.documents
  for each row execute function private.documents_guard();

-- Mensajes --------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  sequence integer not null check (sequence > 0),
  sender text not null check (sender in ('autor', 'agente')),
  content text not null check (char_length(content) > 0),
  -- Fecha declarada del hecho (texto/precisión/zona originales); nunca sustituida por la de carga.
  declared_event_date jsonb not null default '{"kind":"unknown"}'::jsonb
    check (jsonb_typeof(declared_event_date) = 'object'),
  uploaded_at timestamptz not null default now(),
  unique (document_id, sequence),
  unique (id, document_id)
);
select private.make_append_only('public.messages');

create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  message_id uuid not null,
  kind text not null check (kind in ('turno', 'cancelacion', 'error', 'procedencia', 'correccion')),
  -- Metadatos mínimos: sin tokens ni prompts secretos.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (message_id, document_id) references public.messages (id, document_id) on delete restrict
);
create index message_events_message_idx on public.message_events (message_id);
select private.make_append_only('public.message_events');

-- Evidencias ------------------------------------------------------------------------

create table public.evidences (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  message_id uuid,
  kind text not null check (kind in ('texto', 'pdf', 'imagen')),
  mime_type text not null check (char_length(mime_type) > 0),
  byte_length bigint not null check (byte_length >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Clave opaca reservada en `evidences-private`; nunca un nombre de archivo aportado.
  private_location text not null unique check (char_length(private_location) > 0),
  upload_state text not null default 'reserved' check (upload_state in ('reserved', 'accepted')),
  declared_event_date jsonb not null default '{"kind":"unknown"}'::jsonb
    check (jsonb_typeof(declared_event_date) = 'object'),
  uploaded_at timestamptz not null default now(),
  accepted_at timestamptz,
  check ((upload_state = 'accepted') = (accepted_at is not null)),
  unique (id, document_id),
  foreign key (message_id, document_id) references public.messages (id, document_id) on delete restrict
);
create index evidences_document_idx on public.evidences (document_id);

-- El original aceptado no cambia; solo se promueve una vez de reservado a aceptado.
create function private.evidences_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.upload_state = 'accepted' then
      raise exception 'evidences: un original aceptado no se borra'
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id or new.document_id is distinct from old.document_id
     or new.message_id is distinct from old.message_id or new.kind is distinct from old.kind
     or new.mime_type is distinct from old.mime_type or new.byte_length is distinct from old.byte_length
     or new.sha256 is distinct from old.sha256 or new.private_location is distinct from old.private_location
     or new.declared_event_date is distinct from old.declared_event_date
     or new.uploaded_at is distinct from old.uploaded_at then
    raise exception 'evidences: el original es inmutable' using errcode = 'restrict_violation';
  end if;
  if old.upload_state = 'accepted' then
    raise exception 'evidences: un original aceptado es inmutable' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_evidences_guard before update or delete on public.evidences
  for each row execute function private.evidences_guard();

create table public.evidence_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  evidence_id uuid not null,
  method text not null check (char_length(method) > 0),
  model text,
  pages integer[],
  regions jsonb,
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  result jsonb not null,
  extracted_at timestamptz not null default now(),
  unique (id, document_id),
  foreign key (evidence_id, document_id) references public.evidences (id, document_id) on delete restrict
);
create index evidence_extractions_evidence_idx on public.evidence_extractions (evidence_id);
select private.make_append_only('public.evidence_extractions');

-- Borradores (única superficie mutable de operación; CAS por draft_revision) ----------

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents (id) on delete restrict,
  draft_revision integer not null default 0 check (draft_revision >= 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  -- Referencias exactas a mensajes/extracciones/reportes que sustentan la propuesta.
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  updated_at timestamptz not null default now()
);

create function private.drafts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.document_id is distinct from old.document_id then
    raise exception 'drafts: identidad inmutable' using errcode = 'restrict_violation';
  end if;
  if new.draft_revision <= old.draft_revision then
    raise exception 'drafts: draft_revision debe crecer' using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;
create trigger trg_drafts_guard before update on public.drafts
  for each row execute function private.drafts_guard();

-- Reportes de verificación (históricos, privados, append-only) ------------------------

create table public.verification_reports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  input jsonb not null,
  output jsonb not null,
  model text not null check (char_length(model) > 0),
  prompt_version text not null check (char_length(prompt_version) > 0),
  rules_version text not null check (char_length(rules_version) > 0),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  created_at timestamptz not null default now(),
  unique (id, document_id)
);
create index verification_reports_document_idx on public.verification_reports (document_id, created_at desc);
select private.make_append_only('public.verification_reports');

create table public.report_sources (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  report_id uuid not null,
  message_id uuid,
  evidence_id uuid,
  extraction_id uuid,
  check (num_nonnulls(message_id, evidence_id, extraction_id) = 1),
  foreign key (report_id, document_id) references public.verification_reports (id, document_id) on delete restrict,
  foreign key (message_id, document_id) references public.messages (id, document_id) on delete restrict,
  foreign key (evidence_id, document_id) references public.evidences (id, document_id) on delete restrict,
  foreign key (extraction_id, document_id) references public.evidence_extractions (id, document_id) on delete restrict
);
create index report_sources_report_idx on public.report_sources (report_id);
select private.make_append_only('public.report_sources');

-- Auditoría (solo-agregar; datos mínimos) ---------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  document_id uuid references public.documents (id) on delete restrict,
  -- Actor acotado: usuario autenticado o capacidad resuelta; nunca texto libre del cliente.
  actor_scope text not null check (char_length(actor_scope) > 0),
  action text not null check (char_length(action) > 0),
  resource_type text not null check (char_length(resource_type) > 0),
  resource_id uuid,
  outcome text not null check (outcome in ('ok', 'rechazado', 'error')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_events_document_idx on public.audit_events (document_id, created_at);
select private.make_append_only('public.audit_events');

-- Idempotencia (actor/recurso/acción + fingerprint) -----------------------------------

create table public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  actor_scope text not null check (char_length(actor_scope) > 0),
  resource_id uuid not null,
  action text not null check (char_length(action) > 0),
  key text not null check (char_length(key) between 8 and 128),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  -- Resultado seguro y público de la acción; nunca token en claro ni bytes privados.
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_scope, resource_id, action, key)
);
create trigger trg_idempotency_no_update before update on public.idempotency_records
  for each row execute function private.forbid_update();

-- Sin acceso de API por defecto (las lecturas propietarias se otorgan en la migración RLS).
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;
alter table public.evidences enable row level security;
alter table public.evidence_extractions enable row level security;
alter table public.drafts enable row level security;
alter table public.verification_reports enable row level security;
alter table public.report_sources enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_records enable row level security;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
