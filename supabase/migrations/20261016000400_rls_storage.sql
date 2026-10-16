-- RLS y Storage privado (MVP-024; PRD §12.1; data-transactions §2).
--
-- Modelo: el propietario del documento (auth.uid() = documents.owner_id) puede
-- LEER sus filas; ningún rol de API tiene DML (las escrituras llegan por RPC de
-- cada tarea). `anon` no tiene acceso a nada. Las tablas sin política de lectura
-- (solicitudes, idempotencia, finalización, staging, reservas, intentos HCS)
-- son solo del ejecutor de servidor.

-- Ayudantes de propiedad (SECURITY DEFINER, `search_path` vacío, fuera de la API) ------------

create function private.owns_document(doc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc and d.owner_id = (select auth.uid())
  )
$$;

create function private.owns_version(version uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_versions v
    join public.documents d on d.id = v.document_id
    where v.id = version and d.owner_id = (select auth.uid())
  )
$$;

-- Evidencia: lectura del propietario; INSERT solo en reserva propia aún no aceptada.
create function private.can_read_evidence_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evidences e
    join public.documents d on d.id = e.document_id
    where e.private_location = object_name and d.owner_id = (select auth.uid())
  )
$$;

create function private.can_upload_evidence_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evidences e
    join public.documents d on d.id = e.document_id
    where e.private_location = object_name
      and e.upload_state = 'reserved'
      and d.owner_id = (select auth.uid())
  )
$$;

-- PDF/manifiesto: lectura del propietario de lo publicado; INSERT solo en reserva técnica vigente.
create function private.can_read_version_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.version_artifacts a
    where a.object_path = object_name and private.owns_version(a.version_id)
  )
$$;

create function private.can_upload_version_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.artifact_reservations r
    join public.finalization_operations o on o.id = r.operation_id
    join public.documents d on d.id = r.document_id
    where r.object_path = object_name
      and r.state = 'active'
      and r.expires_at > now()
      and o.status = 'active'
      and o.fencing = r.fencing
      and d.owner_id = (select auth.uid())
  )
$$;

revoke all on function private.owns_document(uuid), private.owns_version(uuid),
  private.can_read_evidence_object(text), private.can_upload_evidence_object(text),
  private.can_read_version_object(text), private.can_upload_version_object(text) from public;
grant execute on function private.owns_document(uuid), private.owns_version(uuid),
  private.can_read_evidence_object(text), private.can_upload_evidence_object(text),
  private.can_read_version_object(text), private.can_upload_version_object(text) to authenticated;

-- Lectura propietaria de tablas ----------------------------------------------------------

grant select on public.documents to authenticated;
create policy documents_owner_select on public.documents
  for select to authenticated using (owner_id = (select auth.uid()));

-- Tablas con document_id propio.
do $$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'message_events', 'evidences', 'evidence_extractions', 'drafts',
    'verification_reports', 'report_sources', 'document_revisions', 'revision_snapshots',
    'revision_participants', 'snapshot_sources', 'corroboration_responses', 'document_versions',
    'audit_events']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.owns_document(document_id))',
      t || '_owner_select', t);
  end loop;
end
$$;

-- Tablas que cuelgan de una versión.
do $$
declare
  t text;
begin
  foreach t in array array['version_receipts', 'version_artifacts', 'hedera_registrations']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.owns_version(version_id))',
      t || '_owner_select', t);
  end loop;
end
$$;

-- Storage privado ------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('evidences-private', 'evidences-private', false),
       ('versions-private', 'versions-private', false)
on conflict (id) do update set public = false;

-- Sin políticas de UPDATE/DELETE: sin sobrescritura (`upsert`) ni borrado por roles de API.
create policy evidences_private_select on storage.objects
  for select to authenticated
  using (bucket_id = 'evidences-private' and private.can_read_evidence_object(name));
create policy evidences_private_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidences-private' and private.can_upload_evidence_object(name));

create policy versions_private_select on storage.objects
  for select to authenticated
  using (bucket_id = 'versions-private' and private.can_read_version_object(name));
create policy versions_private_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'versions-private' and private.can_upload_version_object(name));
