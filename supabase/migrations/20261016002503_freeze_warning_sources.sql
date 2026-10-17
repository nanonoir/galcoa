-- Fuente del congelado con reportes discriminados (docs/design/durable-chat-turns.md, «Contraste y lectura
-- congelada»). Aditiva sobre 02000: reemplaza `get_freeze_source` (misma firma, propietario y grants) sin
-- tocar tablas, `freeze_revision` ni las reglas de congelado.
--
-- Antes elegía «el último reporte con output.draftRevision = revisión», sin distinguir quién lo escribió.
-- Ahora lee, del borrador vigente EXACTO, a lo sumo dos reportes por separado:
--   · contraste (Agente 2): `kind = 'contraste'` v1 con el id, la revisión Y el contenido del borrador
--     iguales a los vigentes, o el formato histórico sin `kind` (semilla/F7) con `result` y `draftRevision`
--     en la raíz (compatibilidad explícita; no trae contenido, por eso solo se compara la revisión).
--   · redacción (Agente 1): `kind = 'redaccion'` v1 cuyo `publishedDraftRevision` es la revisión vigente y
--     cuyo id figura en `drafts.source_refs` (lo que publicó `complete_chat_turn`).
-- Un reporte de otra revisión, de otro contenido o de un `kind`/versión desconocidos es irrelevante y se
-- ignora: nunca se rellena con otro. Un redactor no se confunde con un contraste ni al revés.
-- Candidato ≠ válido: el candidato se identifica por tipo, versión y revisión/borrador exactos ANTES de
-- validar su forma. Si el candidato vigente está corrupto, se devuelve tal cual (result/findings/warnings
-- sin normalizar) y el adaptador lo rechaza de forma opaca: jamás se omite en silencio para congelar sin
-- las advertencias que ese reporte debía aportar. Un candidato corrupto tampoco cede el paso a uno más viejo.
-- Las advertencias no bloquean; aquí no se ejecutan reglas ni se infiere ninguna evaluación.
--
-- Propietario: `get_freeze_source` pertenece a `galcoa_f7_writer` (02000) y `postgres` lo tiene con
-- `set false, inherit false`. Para reemplazarla se abre una delegación temporal (set true + CREATE en
-- `public`), se ejecuta como writer —CREATE OR REPLACE conserva propietario, firma y grants— y se cierra
-- restaurando exactamente el estado previo. Sin superusuario ni privilegios permanentes (patrón de 02100).
--
-- Forma devuelta (claves existentes intactas):
--   draft, report ({result, findings} del contraste vigente | null), refs (del contraste),
--   agent1 ({warnings, refs} de la redacción vigente | null).

grant create on schema public to galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set true;
set local role galcoa_f7_writer;

create or replace function public.get_freeze_source(p_document_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := private.f4_actor(); dr public.drafts; con public.verification_reports; red public.verification_reports;
  con_refs jsonb; red_refs jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  perform 1 from public.documents where id = p_document_id and owner_id = actor;
  if not found then return null; end if;
  select * into dr from public.drafts where document_id = p_document_id;
  if not found then return null; end if;

  select * into con from public.verification_reports r
    where r.document_id = p_document_id
      and r.output->>'draftRevision' = dr.draft_revision::text
      and ((r.output->>'kind' = 'contraste' and r.input->>'kind' = 'contraste' and r.output->>'schemaVersion' = '1'
            and r.output->>'draftId' = dr.id::text and r.input->'draft'->'content' = dr.content)
        or (r.output->>'kind' is null and r.input->>'kind' is null))
    order by r.created_at desc, r.id desc limit 1;

  select * into red from public.verification_reports r
    where r.document_id = p_document_id
      and r.output->>'kind' = 'redaccion' and r.input->>'kind' = 'redaccion' and r.output->>'schemaVersion' = '1'
      and r.output->>'publishedDraftRevision' = dr.draft_revision::text
      and exists (select 1 from jsonb_array_elements(dr.source_refs) s where s->>'kind' = 'reporte' and s->>'id' = r.id::text)
    order by r.created_at desc, r.id desc limit 1;

  -- Refs de cada reporte → fuente real (mensaje o evidencia); una extracción se resuelve a su evidencia.
  select coalesce(jsonb_agg(jsonb_build_object('ref', i->>'ref', 'kind', case when i->>'kind' = 'mensaje' then 'mensaje' else 'evidencia' end,
      'id', case when i->>'kind' = 'mensaje' then i->>'id'
                 else (select e.evidence_id::text from public.evidence_extractions e where e.id = (i->>'id')::uuid and e.document_id = p_document_id) end)
      ) filter (where i->>'kind' in ('mensaje', 'extraccion')), '[]'::jsonb)
    into con_refs
    from jsonb_array_elements(case when con.id is not null and jsonb_typeof(con.input->'inputs') = 'array' then con.input->'inputs' else '[]'::jsonb end) i;
  select coalesce(jsonb_agg(jsonb_build_object('ref', i->>'ref', 'kind', case when i->>'kind' = 'mensaje' then 'mensaje' else 'evidencia' end,
      'id', case when i->>'kind' = 'mensaje' then i->>'id'
                 else (select e.evidence_id::text from public.evidence_extractions e where e.id = (i->>'id')::uuid and e.document_id = p_document_id) end)
      ) filter (where i->>'kind' in ('mensaje', 'extraccion')), '[]'::jsonb)
    into red_refs
    from jsonb_array_elements(case when red.id is not null and jsonb_typeof(red.input->'inputs') = 'array' then red.input->'inputs' else '[]'::jsonb end) i;

  return jsonb_build_object(
    'draft', jsonb_build_object('draftId', dr.id, 'documentId', dr.document_id, 'draftRevision', dr.draft_revision,
      'content', dr.content, 'updatedAt', private.f7_ts(dr.updated_at)),
    'report', case when con.id is null then null else jsonb_build_object('result', con.output->'result', 'findings', con.output->'findings') end,
    'refs', con_refs,
    'agent1', case when red.id is null then null else jsonb_build_object('warnings', red.output->'proposal'->'warnings', 'refs', red_refs) end);
end
$$;

reset role;
revoke create on schema public from galcoa_f7_writer;
grant galcoa_f7_writer to postgres with set false, inherit false;
