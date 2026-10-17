import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createTestUser, psql, psqlAs, psqlOk, readLocalStack, SQLSTATE, type TestUser } from "../rls/harness";

/**
 * Persistencia del reporte de contraste (migración 02502): RPC del ejecutor con actor explícito,
 * CAS contra el borrador vigente y escritura atómica sobre `verification_reports`/`report_sources`.
 * Postgres local real; datos ficticios, sin IA ni nube.
 */

let ana: TestUser;
let luis: TestUser;
let foreign: World;

type World = { documentId: string; messageId: string; extractionId: string; draftId: string; content: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const count = async (sql: string) => Number((await psqlOk(`select count(*) from ${sql};`))[0][0]);

async function asExecutor(call: string): Promise<R> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}

/** Documento con mensaje, extracción de evidencia aceptada y borrador en la revisión 3. */
async function world(user: TestUser): Promise<World> {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const sent = await user.client.rpc("append_message", { p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg" });
  const messageId = sent.data.value.messageId as string;
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  const draftId = randomUUID();
  const content = { title: "Titulo", body: "Cuerpo del borrador", corrections: [] };
  await psqlOk(`begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location, upload_state, accepted_at)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}', 'accepted', now());
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
insert into public.drafts (id, document_id, draft_revision, content) values ('${draftId}', '${documentId}', 3, ${json(content)});
commit;`);
  return { documentId, messageId, extractionId, draftId, content };
}

const inputsOf = (w: World) => [
  { ref: "m1", kind: "mensaje", id: w.messageId },
  { ref: "e1", kind: "extraccion", id: w.extractionId },
  { ref: "b1", kind: "borrador", id: w.draftId },
];
const WARNING = { message: "Cantidad distinta", severity: "warning", sourceRefs: ["m1", "b1"] };
const CRITICAL = { message: "Contradicción", severity: "critical", sourceRefs: ["e1", "b1"] };

type Options = { actor?: TestUser; documentId?: string; draftId?: string; revision?: number; content?: unknown; result?: string; findings?: unknown[]; inputs?: unknown };
const callOf = (w: World, o: Options = {}) => {
  const findings = o.findings ?? [WARNING];
  const result = o.result ?? (findings.length === 0 ? "sin_inconsistencias_criticas_detectadas" : "con_advertencias");
  return `public.persist_contrast_report(${lit((o.actor ?? ana).id)}, ${lit(o.documentId ?? w.documentId)}, ${lit(o.draftId ?? w.draftId)}, ${o.revision ?? 3}, ${json(o.content ?? w.content)}, ${lit(result)}, ${json(findings)}, ${json(o.inputs ?? inputsOf(w))}, 'modelo-ficticio', 'contrast-v1', '["limite ficticio"]'::jsonb, 'corr-contrast')`;
};
const persist = (w: World, o?: Options) => asExecutor(callOf(w, o));
const writes = (documentId: string) => Promise.all([
  count(`public.verification_reports where document_id = ${lit(documentId)}`),
  count(`public.report_sources where document_id = ${lit(documentId)}`),
  count(`public.audit_events where document_id = ${lit(documentId)} and action = 'contrast_report.created'`),
]);

beforeAll(async () => {
  const stack = readLocalStack();
  ana = await createTestUser(stack, "con-a");
  luis = await createTestUser(stack, "con-b");
  foreign = await world(luis);
});

describe("acceso: solo el ejecutor, con permisos mínimos", () => {
  it("anon, authenticated y service_role no ejecutan la RPC", async () => {
    const w = await world(ana);
    for (const actor of [{ kind: "anon" }, { kind: "authenticated", userId: ana.id }, { kind: "service_role" }] as const) {
      const result = await psqlAs(actor, `select ${callOf(w)};`);
      expect(result.ok, actor.kind).toBe(false);
      expect(result.error).toContain(`ERROR:  ${SQLSTATE.permission}:`);
    }
    expect(await writes(w.documentId)).toEqual([0, 0, 0]);
  });

  it("el propietario es un rol sin login ni bypass y solo el ejecutor tiene EXECUTE", async () => {
    expect(await psqlOk(`select p.prosecdef, pg_get_userbyid(p.proowner), r.rolcanlogin, r.rolbypassrls, r.rolsuper, coalesce(array_to_string(p.proconfig, ','), ''),
        has_function_privilege('galcoa_executor', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('service_role', p.oid, 'EXECUTE')
      from pg_proc p join pg_roles r on r.oid = p.proowner where p.proname = 'persist_contrast_report';`))
      .toEqual([["t", "galcoa_contrast_writer", "f", "f", "f", "search_path=\"\"", "t", "f", "f", "f"]]);
    expect(await psqlOk(`select has_table_privilege('galcoa_contrast_writer', 'public.drafts', 'INSERT'),
      has_table_privilege('galcoa_contrast_writer', 'public.drafts', 'DELETE'), has_table_privilege('galcoa_contrast_writer', 'public.verification_reports', 'UPDATE'),
      has_table_privilege('galcoa_contrast_writer', 'public.messages', 'INSERT');`)).toEqual([["f", "f", "f", "f"]]);
  });
});

describe("persistencia del reporte", () => {
  it("crea el reporte versionado con fuentes exactas, auditoría mínima y sin tocar el documento", async () => {
    const w = await world(ana);
    const before = await psqlOk(`select document_status, updated_at from public.documents where id = ${lit(w.documentId)};`);
    const draftBefore = await psqlOk(`select draft_revision, content from public.drafts where document_id = ${lit(w.documentId)};`);
    const out = await persist(w);
    expect(out.status).toBe("created");
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

    const [row] = await psqlOk(`select input::text, output::text, model, prompt_version, rules_version, limitations::text from public.verification_reports where id = ${lit(out.reportId)};`);
    expect(JSON.parse(row[0])).toEqual({ kind: "contraste", schemaVersion: 1, inputs: inputsOf(w), draft: { draftId: w.draftId, draftRevision: 3, content: w.content } });
    expect(JSON.parse(row[1])).toEqual({ kind: "contraste", schemaVersion: 1, draftId: w.draftId, draftRevision: 3, result: "con_advertencias", findings: [WARNING] });
    expect(row.slice(2, 5)).toEqual(["modelo-ficticio", "contrast-v1", "contraste-v1"]);
    expect(JSON.parse(row[5])).toEqual(["limite ficticio"]);
    // b1 no se finge como evidencia: solo mensaje y extracción.
    expect(await psqlOk(`select message_id, evidence_id, extraction_id from public.report_sources where report_id = ${lit(out.reportId)} order by message_id nulls last;`))
      .toEqual([[w.messageId, "", ""], ["", "", w.extractionId]]);
    const [audit] = await psqlOk(`select actor_scope, outcome, resource_type, resource_id, metadata::text from public.audit_events where document_id = ${lit(w.documentId)} and action = 'contrast_report.created';`);
    expect(audit.slice(0, 4)).toEqual([ana.id, "ok", "verification_report", out.reportId]);
    expect(JSON.parse(audit[4])).toEqual({ schemaVersion: 1, correlationId: "corr-contrast", draftRevision: 3, result: "con_advertencias", findingCount: 1 });
    expect(await psqlOk(`select document_status, updated_at from public.documents where id = ${lit(w.documentId)};`)).toEqual(before);
    expect(await psqlOk(`select draft_revision, content from public.drafts where document_id = ${lit(w.documentId)};`)).toEqual(draftBefore);
  });

  it("reintentar crea otro reporte histórico sin tocar el anterior", async () => {
    const w = await world(ana);
    const first = await persist(w);
    const snapshot = await psqlOk(`select * from public.verification_reports where id = ${lit(first.reportId)};`);
    const second = await persist(w, { findings: [], result: "sin_inconsistencias_criticas_detectadas" });
    expect(second.status).toBe("created");
    expect(second.reportId).not.toBe(first.reportId);
    expect(await psqlOk(`select * from public.verification_reports where id = ${lit(first.reportId)};`)).toEqual(snapshot);
    expect(await writes(w.documentId)).toEqual([2, 4, 2]);
  });

  it("una contradicción crítica se persiste sin bloquear ni cambiar otras dimensiones", async () => {
    const w = await world(ana);
    const before = await psqlOk(`select document_status from public.documents where id = ${lit(w.documentId)};`);
    const out = await persist(w, { findings: [WARNING, CRITICAL], result: "contradiccion_critica" });
    expect(out.status).toBe("created");
    expect(await psqlOk(`select output->>'result' from public.verification_reports where id = ${lit(out.reportId)};`)).toEqual([["contradiccion_critica"]]);
    expect(await psqlOk(`select document_status from public.documents where id = ${lit(w.documentId)};`)).toEqual(before);
    expect((await persist(w)).status).toBe("created");
    expect(await count(`public.document_revisions where document_id = ${lit(w.documentId)}`)).toBe(0);
  });
});

describe("CAS contra el borrador vigente y aislamiento", () => {
  it("un borrador distinto (revisión, contenido o id) devuelve stale_draft sin escribir nada", async () => {
    const w = await world(ana);
    const stale = [{ revision: 2 }, { revision: 4 }, { content: { ...w.content, body: "Otro cuerpo" } }, { draftId: randomUUID() }];
    for (const o of stale) {
      const inputs = o.draftId ? inputsOf(w).map((i) => (i.kind === "borrador" ? { ...i, id: o.draftId } : i)) : undefined;
      expect((await persist(w, { ...o, inputs })).status, JSON.stringify(o).slice(0, 60)).toBe("stale_draft");
    }
    expect(await writes(w.documentId)).toEqual([0, 0, 0]);
    // Documento propio sin borrador: tampoco hay nada contra qué comparar.
    const empty = await ana.client.rpc("create_document", { p_title: "Sin borrador", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
    expect((await persist(w, { documentId: empty.data.value.documentId })).status).toBe("stale_draft");
  });

  it("documento ajeno o inexistente es indistinguible y no escribe", async () => {
    const w = await world(ana);
    const alien = await persist(foreign, { actor: ana });
    const missing = await persist(w, { documentId: randomUUID() });
    expect(alien).toEqual({ status: "not_available" });
    expect(missing).toEqual(alien);
    expect(await writes(foreign.documentId)).toEqual([0, 0, 0]);
  });

  it("rechaza mensajes, extracciones y borradores falsos o ajenos sin escribir", async () => {
    const w = await world(ana);
    const orphan = randomUUID();
    const bad: [string, Options][] = [
      ["mensaje ajeno", { inputs: inputsOf(w).map((i) => (i.ref === "m1" ? { ...i, id: foreign.messageId } : i)) }],
      ["mensaje inexistente", { inputs: inputsOf(w).map((i) => (i.ref === "m1" ? { ...i, id: orphan } : i)) }],
      ["extracción ajena", { inputs: inputsOf(w).map((i) => (i.ref === "e1" ? { ...i, id: foreign.extractionId } : i)) }],
      ["sin b1", { inputs: inputsOf(w).filter((i) => i.ref !== "b1") }],
      ["b1 con otro id", { inputs: inputsOf(w).map((i) => (i.ref === "b1" ? { ...i, id: orphan } : i)) }],
      ["b1 como mensaje", { inputs: inputsOf(w).map((i) => (i.ref === "b1" ? { ref: "m2", kind: "mensaje", id: w.draftId } : i)) }],
      ["ref duplicada", { inputs: [...inputsOf(w), { ref: "m1", kind: "mensaje", id: w.messageId }] }],
      ["referencia de hallazgo no enviada", { findings: [{ ...WARNING, sourceRefs: ["m9"] }] }],
      ["hallazgo sin referencias", { findings: [{ ...WARNING, sourceRefs: [] }] }],
      ["resultado incoherente", { result: "sin_inconsistencias_criticas_detectadas" }],
      ["crítico sin resultado crítico", { findings: [CRITICAL] }],
    ];
    for (const [label, o] of bad) {
      const result = await psql(`set role galcoa_executor;\nselect ${callOf(w, o)};`, "supabase_admin");
      expect(result.ok, label).toBe(false);
      expect(result.error, label).toContain("ERROR:  22023:");
    }
    // Extracción de una evidencia no aceptada.
    const evidence = randomUUID();
    const pending = randomUUID();
    await psqlOk(`begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location, upload_state)
  values ('${evidence}', '${w.documentId}', '${w.messageId}', 'pdf', 'application/pdf', 10, '${sha("p")}', '${w.documentId}/${randomUUID()}', 'reserved');
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${pending}', '${w.documentId}', '${evidence}', 'prueba', '{}');
commit;`);
    const unaccepted = await psql(`set role galcoa_executor;\nselect ${callOf(w, { inputs: inputsOf(w).map((i) => (i.ref === "e1" ? { ...i, id: pending } : i)) })};`, "supabase_admin");
    expect(unaccepted.ok).toBe(false);
    expect(await writes(w.documentId)).toEqual([0, 0, 0]);
  });
});

describe("atomicidad y concurrencia", () => {
  it("un borrador que cambia en otra conexión hace tardío al contraste (stale_draft, sin escrituras)", async () => {
    const w = await world(ana);
    const changer = psql(`begin;
select pg_backend_pid();
select 1 from public.documents where id = ${lit(w.documentId)} for update;
select pg_sleep(1.2);
update public.drafts set draft_revision = 4, content = ${json({ ...w.content, body: "Nuevo" })} where document_id = ${lit(w.documentId)};
commit;`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const late = psql(`begin;\nset local role galcoa_executor;\nselect pg_backend_pid();\nselect ${callOf(w)};\ncommit;`, "supabase_admin");
    const [a, b] = await Promise.all([changer, late]);
    expect(a.ok, a.error).toBe(true);
    expect(b.ok, b.error).toBe(true);
    expect(a.rows[0][0]).not.toBe(b.rows[0][0]);
    expect(JSON.parse(b.rows[1].join("|")).status).toBe("stale_draft");
    expect(await writes(w.documentId)).toEqual([0, 0, 0]);
  });

  it("si la auditoría falla se revierte todo el reporte y sus fuentes", async () => {
    const w = await world(ana);
    await psqlOk(`create function private.zz_fail_audit() returns trigger language plpgsql as $$ begin
      if new.action = 'contrast_report.created' then raise exception 'auditoria forzada'; end if; return new; end $$;
      create trigger zz_fail_audit before insert on public.audit_events for each row execute function private.zz_fail_audit();`);
    try {
      const result = await psql(`set role galcoa_executor;\nselect ${callOf(w)};`, "supabase_admin");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("auditoria forzada");
      expect(await writes(w.documentId)).toEqual([0, 0, 0]);
    } finally {
      await psqlOk("drop trigger zz_fail_audit on public.audit_events; drop function private.zz_fail_audit();");
    }
    expect((await persist(w)).status).toBe("created");
  });
});
