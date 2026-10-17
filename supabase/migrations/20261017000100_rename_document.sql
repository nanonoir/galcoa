-- Renombrar documento (MVP demo P3/T3). Aditiva. Mismo patrón F4: SECURITY DEFINER,
-- owner galcoa_f4_writer (sin login/bypass), actor = auth.uid() y solo propietario.
-- Idempotente por naturaleza (mismo título = mismo estado); no usa idempotency_records.
grant update (title) on public.documents to galcoa_f4_writer;

create function public.rename_document(p_document_id uuid, p_title text, p_correlation_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); d public.documents; new_title text := btrim(p_title);
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_title is null or char_length(new_title) not between 1 and 200
     or p_correlation_id is null or char_length(p_correlation_id) not between 1 and 128 then
    raise invalid_parameter_value;
  end if;
  select * into d from public.documents where id = p_document_id and owner_id = actor for update;
  if not found then return jsonb_build_object('status', 'not_available'); end if;
  if d.document_status = 'finalizado' then return jsonb_build_object('status', 'finalized'); end if;
  if d.title = new_title then
    return jsonb_build_object('status', 'unchanged', 'value', private.f4_document_json(d));
  end if;
  update public.documents set title = new_title, updated_at = clock_timestamp() where id = p_document_id returning * into d;
  insert into public.audit_events(document_id, actor_scope, action, resource_type, resource_id, outcome, metadata)
    values(d.id, actor::text, 'document.renamed', 'document', d.id, 'ok', jsonb_build_object('schemaVersion', 1, 'correlationId', p_correlation_id));
  return jsonb_build_object('status', 'updated', 'value', private.f4_document_json(d));
end
$$;

-- Cambio explícito de owner; CREATE temporal, nunca en runtime (igual que F4).
grant create on schema public to galcoa_f4_writer;
grant galcoa_f4_writer to postgres with set true;
alter function public.rename_document(uuid, text, text) owner to galcoa_f4_writer;
set local role galcoa_f4_writer;
revoke all on function public.rename_document(uuid, text, text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.rename_document(uuid, text, text) to authenticated;
reset role;
revoke create on schema public from galcoa_f4_writer;
grant galcoa_f4_writer to postgres with set false, inherit false;
