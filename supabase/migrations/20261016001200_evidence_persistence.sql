-- MVP-042/043: reservas y originales; solo ejecutor ligado a Auth en servidor.
alter table public.evidences add column upload_expires_at timestamptz not null default (clock_timestamp() + interval '120 seconds');
create role galcoa_evidence_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public, private to galcoa_evidence_writer;
grant select on public.documents to galcoa_evidence_writer;
grant update (updated_at) on public.documents to galcoa_evidence_writer;
grant select, insert, delete on public.evidences to galcoa_evidence_writer;
grant update (upload_state, accepted_at) on public.evidences to galcoa_evidence_writer;
grant select, insert on public.evidence_extractions, public.idempotency_records to galcoa_evidence_writer;
grant insert on public.audit_events to galcoa_evidence_writer;
grant usage on sequence public.audit_events_id_seq to galcoa_evidence_writer;
grant execute on function private.f4_valid_declared(jsonb) to galcoa_evidence_writer;
create policy evidence_writer_documents on public.documents to galcoa_evidence_writer using (true) with check (true);
create policy evidence_writer_originals on public.evidences to galcoa_evidence_writer using (true) with check (true);
create policy evidence_writer_extractions on public.evidence_extractions to galcoa_evidence_writer using (true) with check (true);
create policy evidence_writer_idempotency on public.idempotency_records to galcoa_evidence_writer using (true) with check (true);
create policy evidence_writer_audit on public.audit_events for insert to galcoa_evidence_writer with check (true);

create function private.evidence_json(e public.evidences) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('evidenceId',e.id,'documentId',e.document_id,'kind',e.kind,
 'mimeType',e.mime_type,'byteLength',e.byte_length,'sha256',e.sha256,'privateLocation',e.private_location,
 'uploadState',e.upload_state,'declaredEventDate',e.declared_event_date,'uploadedAt',e.uploaded_at,
 'acceptedAt',e.accepted_at,'uploadExpiresAt',e.upload_expires_at)
$$;
create function private.extraction_json(e public.evidence_extractions) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('extractionId',e.id,'documentId',e.document_id,'evidenceId',e.evidence_id,
 'method',e.method,'model',e.model,'promptVersion',e.result->'promptVersion','pages',e.pages,
 'text',e.result->'text','limitations',e.limitations,'extractedAt',e.extracted_at)
$$;

create function public.reserve_evidence(p_actor_id uuid, p_document_id uuid, p_kind text, p_mime_type text,
 p_byte_length bigint, p_sha256 text, p_private_location text, p_declared_event_date jsonb, p_key text, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.evidences; prior public.idempotency_records; fp text; files bigint; total bigint;
begin
 if p_actor_id is null then raise insufficient_privilege; end if;
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
 -- Recalcular semántica: no confiar solo en el fingerprint que recibe el adapter.
 fp := encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'mime',p_mime_type,'bytes',p_byte_length,
   'sha256',p_sha256,'declared',p_declared_event_date)::text,'UTF8')),'hex');
 select * into prior from public.idempotency_records where actor_scope=p_actor_id::text and resource_id=p_document_id and action='evidence.reserve' and key=p_key;
 if found then
   if prior.fingerprint <> fp then return jsonb_build_object('status','idempotency_conflict'); end if;
   select * into e from public.evidences where id=(prior.result->>'evidenceId')::uuid and document_id=p_document_id;
   if not found or (e.upload_state='reserved' and e.upload_expires_at <= clock_timestamp()) then
     return jsonb_build_object('status','not_available'); end if;
   return jsonb_build_object('status','replayed','evidence',private.evidence_json(e));
 end if;
 select count(*),coalesce(sum(byte_length),0) into files,total from public.evidences
   where document_id=p_document_id and (upload_state='accepted' or upload_expires_at>clock_timestamp());
 if files >= 3 then return jsonb_build_object('status','limit_exceeded','limit','files'); end if;
 if total+p_byte_length > 20971520 then return jsonb_build_object('status','limit_exceeded','limit','total_bytes'); end if;
 insert into public.evidences(document_id,kind,mime_type,byte_length,sha256,private_location,declared_event_date,upload_expires_at)
 values(p_document_id,p_kind,p_mime_type,p_byte_length,p_sha256,p_private_location,p_declared_event_date,clock_timestamp()+interval '120 seconds') returning * into e;
 insert into public.idempotency_records(actor_scope,resource_id,action,key,fingerprint,result)
 values(p_actor_id::text,p_document_id,'evidence.reserve',p_key,fp,jsonb_build_object('evidenceId',e.id));
 return jsonb_build_object('status','reserved','evidence',private.evidence_json(e));
end $$;

create function public.get_evidence(p_actor_id uuid,p_document_id uuid,p_evidence_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select private.evidence_json(e) from public.evidences e join public.documents d on d.id=e.document_id
 where d.owner_id=p_actor_id and d.id=p_document_id and e.id=p_evidence_id
$$;
create function public.list_evidences(p_actor_id uuid,p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select (select coalesce(jsonb_agg(private.evidence_json(e) order by e.uploaded_at,e.id),'[]'::jsonb)
 from public.evidences e where e.document_id=d.id) from public.documents d where d.id=p_document_id and d.owner_id=p_actor_id
$$;
create function public.accept_evidence(p_actor_id uuid,p_evidence_id uuid,p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.evidences; doc uuid;
begin
 select document_id into doc from public.evidences where id=p_evidence_id;
 perform 1 from public.documents where id=doc and owner_id=p_actor_id for update;
 if not found then return null; end if;
 select * into e from public.evidences where id=p_evidence_id and document_id=doc;
 if not found then return null; end if;
 if e.upload_state='accepted' then return private.evidence_json(e); end if;
 if e.upload_expires_at <= clock_timestamp() then return null; end if;
 if p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then raise invalid_parameter_value; end if;
 update public.evidences set upload_state='accepted',accepted_at=clock_timestamp() where id=e.id returning * into e;
 insert into public.audit_events(document_id,actor_scope,action,resource_type,resource_id,outcome,metadata)
 values(doc,p_actor_id::text,'evidence.accepted','evidence',e.id,'ok',jsonb_build_object('schemaVersion',1,'correlationId',p_correlation_id));
 return private.evidence_json(e);
end $$;
create function public.discard_evidence_reservation(p_actor_id uuid,p_evidence_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare doc uuid;
begin
 select document_id into doc from public.evidences where id=p_evidence_id;
 perform 1 from public.documents where id=doc and owner_id=p_actor_id for update;
 if not found then return; end if;
 delete from public.evidences where id=p_evidence_id and document_id=doc and upload_state='reserved';
end $$;
create function public.append_evidence_extraction(p_actor_id uuid,p_document_id uuid,p_evidence_id uuid,
 p_method text,p_model text,p_prompt_version text,p_pages integer[],p_text text,p_limitations jsonb,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.evidence_extractions;
begin
 perform 1 from public.documents where id=p_document_id and owner_id=p_actor_id for update;
 if not found then raise insufficient_privilege; end if;
 perform 1 from public.evidences where id=p_evidence_id and document_id=p_document_id and upload_state='accepted';
 if not found then raise insufficient_privilege; end if;
 if p_method is null or p_method not in ('directo','gemini') or p_text is null
   or p_limitations is null or jsonb_typeof(p_limitations)<>'array'
   or exists(select 1 from jsonb_array_elements(p_limitations) v where jsonb_typeof(v)<>'string')
   or (p_pages is not null and exists(select 1 from unnest(p_pages) v where v is null or v<1 or v>10))
   or (p_method='gemini' and (p_model is null or char_length(p_model)=0 or p_prompt_version is null or char_length(p_prompt_version)=0))
   or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then raise invalid_parameter_value; end if;
 insert into public.evidence_extractions(document_id,evidence_id,method,model,pages,limitations,result)
 values(p_document_id,p_evidence_id,p_method,p_model,p_pages,p_limitations,jsonb_build_object('schemaVersion',1,'text',p_text,'promptVersion',p_prompt_version)) returning * into e;
 insert into public.audit_events(document_id,actor_scope,action,resource_type,resource_id,outcome,metadata)
 values(p_document_id,p_actor_id::text,'extraction.recorded','extraction',e.id,'ok',jsonb_build_object('schemaVersion',1,'correlationId',p_correlation_id));
 return private.extraction_json(e);
end $$;
create function public.list_evidence_extractions(p_actor_id uuid,p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select (select coalesce(jsonb_agg(private.extraction_json(e) order by e.extracted_at,e.id),'[]'::jsonb)
 from public.evidence_extractions e where e.document_id=d.id) from public.documents d where d.id=p_document_id and d.owner_id=p_actor_id
$$;

-- La sesión conserva su JWT; la autoridad para INSERT expira en la DB.
create or replace function private.can_upload_evidence_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.evidences e join public.documents d on d.id=e.document_id
 where e.private_location=object_name and e.upload_state='reserved'
 and e.upload_expires_at>statement_timestamp() and d.owner_id=(select auth.uid()))
$$;
update storage.buckets set file_size_limit=10485760, allowed_mime_types=array['application/pdf','image/jpeg','image/png'] where id='evidences-private';

grant create on schema public,private to galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set true;
alter function private.evidence_json(public.evidences) owner to galcoa_evidence_writer;
alter function private.extraction_json(public.evidence_extractions) owner to galcoa_evidence_writer;
alter function public.reserve_evidence(uuid,uuid,text,text,bigint,text,text,jsonb,text,text) owner to galcoa_evidence_writer;
alter function public.get_evidence(uuid,uuid,uuid) owner to galcoa_evidence_writer;
alter function public.list_evidences(uuid,uuid) owner to galcoa_evidence_writer;
alter function public.accept_evidence(uuid,uuid,text) owner to galcoa_evidence_writer;
alter function public.discard_evidence_reservation(uuid,uuid) owner to galcoa_evidence_writer;
alter function public.append_evidence_extraction(uuid,uuid,uuid,text,text,text,integer[],text,jsonb,text) owner to galcoa_evidence_writer;
alter function public.list_evidence_extractions(uuid,uuid) owner to galcoa_evidence_writer;
set local role galcoa_evidence_writer;
revoke all on function private.evidence_json(public.evidences),private.extraction_json(public.evidence_extractions) from public,anon,authenticated,service_role,galcoa_executor;
revoke all on function public.reserve_evidence(uuid,uuid,text,text,bigint,text,text,jsonb,text,text),
 public.get_evidence(uuid,uuid,uuid),public.list_evidences(uuid,uuid),public.accept_evidence(uuid,uuid,text),
 public.discard_evidence_reservation(uuid,uuid),public.append_evidence_extraction(uuid,uuid,uuid,text,text,text,integer[],text,jsonb,text),
 public.list_evidence_extractions(uuid,uuid) from public,anon,authenticated,service_role,galcoa_executor;
grant execute on function public.reserve_evidence(uuid,uuid,text,text,bigint,text,text,jsonb,text,text),
 public.get_evidence(uuid,uuid,uuid),public.list_evidences(uuid,uuid),public.accept_evidence(uuid,uuid,text),
 public.discard_evidence_reservation(uuid,uuid),public.append_evidence_extraction(uuid,uuid,uuid,text,text,text,integer[],text,jsonb,text),
 public.list_evidence_extractions(uuid,uuid) to galcoa_executor;
reset role;
revoke create on schema public,private from galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set false,inherit false;
