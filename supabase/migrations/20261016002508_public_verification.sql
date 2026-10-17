-- Lectura pública para el verificador (MVP-100/101; INV-15, SH-02). Aditiva: una función de solo lectura.
--
-- `anon` no recibe ningún privilegio sobre tablas: ejecuta únicamente esta función, que proyecta por allowlist
-- lo que consume el servicio de verificación (referencia, hashes del envelope público, `manifest_hash`, estado
-- HCS y localizadores del registro comprobado). Nunca devuelve nonce, operación, participantes, constancias,
-- evidencias, chat, rutas, ids privados, payload ni bytes firmados. Referencia inválida e inexistente devuelven
-- lo mismo (`not_available`). No toma locks ni modifica nada.
--
-- Estado público: registro comprobado → `registrado`; intento activo (pendiente/incierto) → `pendiente`; solo
-- intentos fallidos → `fallido`; sin intentos → `no_iniciado`.
--
-- Propietario: `galcoa_f7_writer` (mismo mecanismo que 02505); se le concede SELECT mínimo sobre los registros.

-- `document_versions` ya tiene su SELECT y política (02504); aquí se añaden las dos tablas de sello, solo lectura.
grant select on public.hedera_attempts, public.hedera_registrations to galcoa_f7_writer;
create policy pv_attempts on public.hedera_attempts for select to galcoa_f7_writer using (true);
create policy pv_registrations on public.hedera_registrations for select to galcoa_f7_writer using (true);

create function public.get_public_verification(p_reference text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.document_versions; reg public.hedera_registrations; status text;
begin
  if p_reference is null or p_reference !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'not_available');
  end if;
  select * into v from public.document_versions where public_reference = p_reference;
  if not found
     or v.envelope->>'pdfHash' is null or v.envelope->>'pdfHash' !~ '^[0-9a-f]{64}$'
     or v.envelope->>'privateDetailHash' is null or v.envelope->>'privateDetailHash' !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_available');
  end if;
  select * into reg from public.hedera_registrations where version_id = v.id;
  if found then
    status := 'registrado';
  elsif exists (select 1 from public.hedera_attempts where version_id = v.id and outcome in ('pendiente', 'incierto')) then
    status := 'pendiente';
  elsif exists (select 1 from public.hedera_attempts where version_id = v.id and outcome = 'fallido') then
    status := 'fallido';
  else
    status := 'no_iniciado';
  end if;
  return jsonb_build_object('status', 'found', 'record', jsonb_build_object(
    'reference', v.public_reference,
    'envelope', jsonb_build_object('pdfHash', v.envelope->>'pdfHash', 'privateDetailHash', v.envelope->>'privateDetailHash'),
    'manifestHash', v.manifest_hash,
    'hcsStatus', status,
    'registration', case when reg.id is null then null else jsonb_build_object(
      'network', reg.network, 'topicId', reg.topic_id, 'sequenceNumber', reg.sequence_number::text,
      'transactionId', reg.transaction_id) end));
end
$$;

grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
alter function public.get_public_verification(text) owner to galcoa_f7_writer;
set local role galcoa_f7_writer;
revoke all on function public.get_public_verification(text) from public, anon, authenticated, service_role, galcoa_executor;
grant execute on function public.get_public_verification(text) to anon, authenticated;
reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
