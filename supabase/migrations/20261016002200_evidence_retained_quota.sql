-- El vencimiento revoca la subida, pero no prueba la eliminación del objeto.
-- Conservar cuota hasta descartar la reserva; no cambiar TTL ni originales.
grant create on schema public to galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set true;
set local role galcoa_evidence_writer;

create or replace function public.reserve_evidence(p_actor_id uuid, p_document_id uuid, p_kind text, p_mime_type text,
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
 -- Una fila retenida puede tener bytes en Storage aunque su permiso expiró.
 select count(*),coalesce(sum(byte_length),0) into files,total from public.evidences
   where document_id=p_document_id;
 if files >= 3 then return jsonb_build_object('status','limit_exceeded','limit','files'); end if;
 if total+p_byte_length > 20971520 then return jsonb_build_object('status','limit_exceeded','limit','total_bytes'); end if;
 insert into public.evidences(document_id,kind,mime_type,byte_length,sha256,private_location,declared_event_date,upload_expires_at)
 values(p_document_id,p_kind,p_mime_type,p_byte_length,p_sha256,p_private_location,p_declared_event_date,clock_timestamp()+interval '120 seconds') returning * into e;
 insert into public.idempotency_records(actor_scope,resource_id,action,key,fingerprint,result)
 values(p_actor_id::text,p_document_id,'evidence.reserve',p_key,fp,jsonb_build_object('evidenceId',e.id));
 return jsonb_build_object('status','reserved','evidence',private.evidence_json(e));
end $$;

revoke all on function public.reserve_evidence(uuid,uuid,text,text,bigint,text,text,jsonb,text,text)
 from public,anon,authenticated,service_role,galcoa_executor;
grant execute on function public.reserve_evidence(uuid,uuid,text,text,bigint,text,text,jsonb,text,text) to galcoa_executor;
reset role;
revoke create on schema public from galcoa_evidence_writer;
grant galcoa_evidence_writer to postgres with set false,inherit false;
