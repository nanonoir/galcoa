-- Lectura del estado de finalización (MVP-080, `GET` de estado). Aditiva: una función de solo lectura.
--
-- Solo el propietario del documento (`auth.uid()`) la consulta. Documento ajeno, revisión de otro documento
-- e inexistente devuelven el mismo `not_available` (indistinguibles). Sin operación para una revisión propia:
-- `no_operation`. Proyección mínima: `operationId`, `phase`, `status` y `versionNumber`; nunca nonce, fencing,
-- hashes, lease ni la identidad de versión reservada (INV-05, INV-06). No toma locks ni consume nada.
--
-- Propietario: `galcoa_f7_writer` (mismo mecanismo que 02504); ya tiene SELECT sobre `finalization_operations`.

create function public.get_finalization_status(p_document_id uuid, p_revision_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); op public.finalization_operations;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_document_id is null or p_revision_id is null then raise invalid_parameter_value; end if;
  if not exists (
    select 1 from public.documents d join public.document_revisions r on r.document_id = d.id
    where d.id = p_document_id and d.owner_id = actor and r.id = p_revision_id) then
    return jsonb_build_object('status', 'not_available');
  end if;
  select * into op from public.finalization_operations where revision_id = p_revision_id and document_id = p_document_id;
  if not found then return jsonb_build_object('status', 'no_operation'); end if;
  return jsonb_build_object('status', 'found', 'operation', jsonb_build_object(
    'operationId', op.id, 'phase', op.phase, 'status', op.status, 'versionNumber', op.version_number));
end
$$;

grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.get_finalization_status(uuid, uuid) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.get_finalization_status(uuid, uuid) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_finalization_status(uuid, uuid) to authenticated;
reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
