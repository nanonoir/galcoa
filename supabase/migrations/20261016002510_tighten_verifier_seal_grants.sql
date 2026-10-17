-- Acota los privilegios de lectura de `galcoa_f7_writer` sobre las tablas de sello (revisión cruzada de 02508).
--
-- 02508 concedió SELECT de tabla completa, lo que expone `payload` y `signed_bytes` (protegidos con grants por
-- columna). `get_public_verification` solo necesita `version_id` y `outcome` de los intentos y los localizadores
-- públicos del registro. Como un SELECT * exige todas las columnas, la función se reemplaza proyectando columnas
-- explícitas. Mismo contrato de salida; sin cambios de propietario ni de EXECUTE (CREATE OR REPLACE los conserva).

revoke select on public.hedera_attempts, public.hedera_registrations from galcoa_f7_writer;
grant select (version_id, outcome) on public.hedera_attempts to galcoa_f7_writer;
grant select (id, version_id, network, topic_id, sequence_number, transaction_id) on public.hedera_registrations to galcoa_f7_writer;

-- La función pertenece a `galcoa_f7_writer` (02508): el reemplazo exige delegación temporal de rol. Los grants de
-- tabla de arriba los emite `postgres`, dueño de las tablas.
grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
set local role galcoa_f7_writer;

create or replace function public.get_public_verification(p_reference text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.document_versions; reg record; has_reg boolean; status text;
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
  select r.id, r.network, r.topic_id, r.sequence_number, r.transaction_id into reg
    from public.hedera_registrations r where r.version_id = v.id;
  has_reg := found;
  if has_reg then
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
    'registration', case when not has_reg then null else jsonb_build_object(
      'network', reg.network, 'topicId', reg.topic_id, 'sequenceNumber', reg.sequence_number::text,
      'transactionId', reg.transaction_id) end));
end
$$;

reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
