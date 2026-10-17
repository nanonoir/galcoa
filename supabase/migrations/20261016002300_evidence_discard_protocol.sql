-- Descarte irreversible antes de eliminar bytes; liberar cuota solo después.
alter table public.evidences add column cleanup_claimed_at timestamptz;
grant update (cleanup_claimed_at) on public.evidences to galcoa_evidence_writer;

create function private.evidence_discard_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
 if tg_op='DELETE' then
   if old.cleanup_claimed_at is null then raise exception 'Reserva sin descarte reclamado' using errcode='restrict_violation'; end if;
   return old;
 end if;
 if old.cleanup_claimed_at is not null and
   (new.cleanup_claimed_at is distinct from old.cleanup_claimed_at or new.upload_state <> 'reserved') then
   raise exception 'Descarte irreversible' using errcode='restrict_violation';
 end if;
 if new.cleanup_claimed_at is not null and new.upload_state <> 'reserved' then
   raise exception 'Original inmutable' using errcode='restrict_violation';
 end if;
 return new;
end $$;
revoke all on function private.evidence_discard_guard() from public,anon,authenticated,service_role;
create trigger trg_evidence_discard_guard before update or delete on public.evidences
 for each row execute function private.evidence_discard_guard();

-- El INSERT final se serializa con claim/aceptación, no solo el preflight.
create or replace function private.can_upload_evidence_object(object_name text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare doc uuid;
begin
 select d.id into doc from public.documents d join public.evidences e on e.document_id=d.id
 where e.private_location=object_name and d.owner_id=(select auth.uid());
 if doc is null then return false; end if;
 perform 1 from public.documents where id=doc and owner_id=(select auth.uid()) for update;
 if not found then return false; end if;
 return exists(select 1 from public.evidences e where e.document_id=doc and e.private_location=object_name
   and e.upload_state='reserved' and e.cleanup_claimed_at is null and e.upload_expires_at>clock_timestamp());
end $$;

grant create on schema public,private to galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set true;
set local role galcoa_evidence_writer;
create or replace function private.evidence_json(e public.evidences) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('evidenceId',e.id,'documentId',e.document_id,'kind',e.kind,
 'mimeType',e.mime_type,'byteLength',e.byte_length,'sha256',e.sha256,'privateLocation',e.private_location,
 'uploadState',e.upload_state,'declaredEventDate',e.declared_event_date,'uploadedAt',e.uploaded_at,
 'acceptedAt',e.accepted_at,'uploadExpiresAt',e.upload_expires_at,'cleanupClaimedAt',e.cleanup_claimed_at)
$$;
create function public.claim_evidence_discard(p_actor_id uuid,p_evidence_id uuid,p_rejected boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.evidences; doc uuid;
begin
 if p_actor_id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('evidence:'||p_actor_id::text,0));
 select document_id into doc from public.evidences where id=p_evidence_id;
 perform 1 from public.documents where id=doc and owner_id=p_actor_id for update;
 if not found then return null; end if;
 select * into e from public.evidences where id=p_evidence_id and document_id=doc;
 if not found or e.upload_state <> 'reserved' then return null; end if;
 if e.cleanup_claimed_at is null then
   if not coalesce(p_rejected,false) and e.upload_expires_at>clock_timestamp() then return null; end if;
   update public.evidences set cleanup_claimed_at=clock_timestamp() where id=e.id returning * into e;
 end if;
 return private.evidence_json(e);
end $$;
create function public.list_evidence_discards(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(private.evidence_json(candidate.e)),'[]'::jsonb) from (
   select e from public.evidences e join public.documents d on d.id=e.document_id
   where d.owner_id=p_actor_id and e.upload_state='reserved'
     and (e.cleanup_claimed_at is not null or e.upload_expires_at<=statement_timestamp())
   order by e.uploaded_at,e.id limit 3
 ) candidate
$$;
create or replace function public.accept_evidence(p_actor_id uuid,p_evidence_id uuid,p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.evidences; doc uuid;
begin
 select document_id into doc from public.evidences where id=p_evidence_id;
 perform 1 from public.documents where id=doc and owner_id=p_actor_id for update;
 if not found then return null; end if;
 select * into e from public.evidences where id=p_evidence_id and document_id=doc;
 if not found then return null; end if;
 if e.upload_state='accepted' then return private.evidence_json(e); end if;
 if e.cleanup_claimed_at is not null or e.upload_expires_at<=clock_timestamp() then return null; end if;
 if p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then raise invalid_parameter_value; end if;
 update public.evidences set upload_state='accepted',accepted_at=clock_timestamp() where id=e.id returning * into e;
 insert into public.audit_events(document_id,actor_scope,action,resource_type,resource_id,outcome,metadata)
 values(doc,p_actor_id::text,'evidence.accepted','evidence',e.id,'ok',jsonb_build_object('schemaVersion',1,'correlationId',p_correlation_id));
 return private.evidence_json(e);
end $$;
create or replace function public.reserve_evidence(p_actor_id uuid, p_document_id uuid, p_kind text, p_mime_type text,
 p_byte_length bigint, p_sha256 text, p_private_location text, p_declared_event_date jsonb, p_key text, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.evidences; prior public.idempotency_records; fp text; files bigint; total bigint;
begin
 if p_actor_id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('evidence:'||p_actor_id::text,0));
 perform 1 from public.documents where id=p_document_id and owner_id=p_actor_id for update;
 if not found then return jsonb_build_object('status','not_available'); end if;
 if p_kind is null or p_mime_type is null or not ((p_kind='pdf' and p_mime_type='application/pdf') or
   (p_kind='imagen' and p_mime_type in ('image/jpeg','image/png')))
   or p_byte_length is null or p_byte_length not between 1 and 10485760
   or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
   or p_private_location is null or p_private_location !~ ('^' || p_document_id::text || '/[0-9a-f-]{36}$')
   or not private.f4_valid_declared(p_declared_event_date)
   or p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,128}$'
   or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise invalid_parameter_value; end if;
 fp := encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'mime',p_mime_type,'bytes',p_byte_length,
   'sha256',p_sha256,'declared',p_declared_event_date)::text,'UTF8')),'hex');
 select * into prior from public.idempotency_records where actor_scope=p_actor_id::text and resource_id=p_document_id and action='evidence.reserve' and key=p_key;
 if found then
   if prior.fingerprint <> fp then return jsonb_build_object('status','idempotency_conflict'); end if;
   select * into e from public.evidences where id=(prior.result->>'evidenceId')::uuid and document_id=p_document_id;
   if not found or e.cleanup_claimed_at is not null or (e.upload_state='reserved' and e.upload_expires_at<=clock_timestamp()) then
     return jsonb_build_object('status','not_available'); end if;
   return jsonb_build_object('status','replayed','evidence',private.evidence_json(e));
 end if;
 if exists(select 1 from public.evidences x join public.documents d on d.id=x.document_id
   where d.owner_id=p_actor_id and x.upload_state='reserved'
     and (x.cleanup_claimed_at is not null or x.upload_expires_at<=clock_timestamp())) then
   return jsonb_build_object('status','discard_pending');
 end if;
 select count(*),coalesce(sum(byte_length),0) into files,total from public.evidences where document_id=p_document_id;
 if files>=3 then return jsonb_build_object('status','limit_exceeded','limit','files'); end if;
 if total+p_byte_length>20971520 then return jsonb_build_object('status','limit_exceeded','limit','total_bytes'); end if;
 insert into public.evidences(document_id,kind,mime_type,byte_length,sha256,private_location,declared_event_date,upload_expires_at)
 values(p_document_id,p_kind,p_mime_type,p_byte_length,p_sha256,p_private_location,p_declared_event_date,clock_timestamp()+interval '120 seconds') returning * into e;
 insert into public.idempotency_records(actor_scope,resource_id,action,key,fingerprint,result)
 values(p_actor_id::text,p_document_id,'evidence.reserve',p_key,fp,jsonb_build_object('evidenceId',e.id));
 return jsonb_build_object('status','reserved','evidence',private.evidence_json(e));
end $$;
create or replace function public.discard_evidence_reservation(p_actor_id uuid,p_evidence_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare doc uuid;
begin
 if p_actor_id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended('evidence:'||p_actor_id::text,0));
 select document_id into doc from public.evidences where id=p_evidence_id;
 perform 1 from public.documents where id=doc and owner_id=p_actor_id for update;
 if not found then return; end if;
 delete from public.evidences where id=p_evidence_id and document_id=doc
   and upload_state='reserved' and cleanup_claimed_at is not null;
end $$;
revoke all on function public.claim_evidence_discard(uuid,uuid,boolean),public.list_evidence_discards(uuid)
 from public,anon,authenticated,service_role,galcoa_executor;
grant execute on function public.claim_evidence_discard(uuid,uuid,boolean),public.list_evidence_discards(uuid) to galcoa_executor;
reset role;
revoke create on schema public,private from galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set false,inherit false;
