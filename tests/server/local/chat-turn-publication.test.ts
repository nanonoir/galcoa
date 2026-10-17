import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createTestUser, expectRejected, psql, psqlAs, psqlOk, readLocalStack, seedDocument, SQLSTATE, type TestUser } from "../rls/harness";

/**
 * Turnos de chat durables, checkpoint 2 (migración 02501): staging por intento y publicación
 * atómica con Postgres/Auth locales reales. Las RPC son del ejecutor (actor explícito). No
 * acreditan chat funcional, IA real ni rutas HTTP. Datos ficticios.
 */

let ana: TestUser;
let luis: TestUser;
let foreign: World;

type World = { documentId: string; messageId: string; extractionId: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const FP = sha("intencion-completa");
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const newClientId = () => `turn-${randomUUID()}`;
const count = async (sql: string) => Number((await psqlOk(`select count(*) from ${sql};`))[0][0]);

async function asExecutor(call: string): Promise<R> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}

async function author(user: TestUser, documentId: string, content: string): Promise<string> {
  const r = await user.client.rpc("append_message", { p_document_id: documentId, p_content: content, p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg" });
  return r.data.value.messageId as string;
}

/** Documento con un mensaje del autor y una extracción de una evidencia aceptada. */
async function world(user: TestUser): Promise<World> {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const messageId = await author(user, documentId, "Vendí 10 cajas");
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  await psqlOk(`begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location, upload_state, accepted_at)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}', 'accepted', now());
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
commit;`);
  return { documentId, messageId, extractionId };
}

const claim = (user: TestUser, documentId: string, clientId: string) =>
  asExecutor(`public.claim_chat_turn(${lit(user.id)}, ${lit(documentId)}, ${lit(clientId)}, ${lit(FP)}, 90, 'corr-turn')`);
const attach = (user: TestUser, turnId: string, attempt: number, messageId: string) =>
  asExecutor(`public.attach_chat_turn_message(${lit(user.id)}, ${lit(turnId)}, ${attempt}, ${lit(messageId)})`);
const close = (user: TestUser, turnId: string, attempt: number, state = "cancelado") =>
  asExecutor(`public.close_chat_turn(${lit(user.id)}, ${lit(turnId)}, ${attempt}, ${lit(state)}, 'cancelado_usuario', 'corr-turn')`);
const expire = (turnId: string) => psqlOk(`update public.chat_turns set lease_expires_at = clock_timestamp() - interval '1 second' where id = ${lit(turnId)};`);

const proposalOf = (title: string) => ({ title, body: `Cuerpo ${title}`, facts: [], warnings: [] });
const contentOf = (title: string) => ({ title, body: `Cuerpo ${title}`, corrections: ["a → b (m1)"] });
const inputsOf = (w: World) => [{ ref: "m1", kind: "mensaje", id: w.messageId }, { ref: "e1", kind: "extraccion", id: w.extractionId }];

type StageOptions = { inputs?: unknown; content?: unknown; actor?: TestUser };
const stageCall = (user: TestUser, turnId: string, attempt: number, expected: number, w: World, title = "Titulo", o: StageOptions = {}) =>
  `public.stage_chat_turn_proposal(${lit((o.actor ?? user).id)}, ${lit(turnId)}, ${attempt}, ${expected}, ${json(o.content ?? contentOf(title))}, ${json(proposalOf(title))}, ${json(o.inputs ?? inputsOf(w))}, 'modelo-ficticio', 'prompt-v1', '["limite ficticio"]'::jsonb, 'corr-turn')`;
const stage = (...args: Parameters<typeof stageCall>) => asExecutor(stageCall(...args));
const completeCall = (user: TestUser, turnId: string, attempt: number, text = "Respuesta ficticia") =>
  `public.complete_chat_turn(${lit(user.id)}, ${lit(turnId)}, ${attempt}, ${lit(text)}, 'corr-turn')`;
const complete = (...args: Parameters<typeof completeCall>) => asExecutor(completeCall(...args));

/** Reclama un turno nuevo con su mensaje de autor ya ligado (el flujo previo a invocar IA). */
async function openTurn(user: TestUser, w: World, clientId = newClientId()) {
  const turn = (await claim(user, w.documentId, clientId)).turn;
  const messageId = await author(user, w.documentId, `Pregunta ${randomUUID()}`);
  await attach(user, turn.turnId, 1, messageId);
  return { turnId: turn.turnId as string, clientId };
}

const published = (documentId: string) => Promise.all([
  count(`public.drafts where document_id = ${lit(documentId)}`),
  count(`public.verification_reports where document_id = ${lit(documentId)}`),
  count(`public.messages where document_id = ${lit(documentId)} and sender = 'agente'`),
]);

beforeAll(async () => {
  const stack = readLocalStack();
  ana = await createTestUser(stack, "pub-a");
  luis = await createTestUser(stack, "pub-b");
  foreign = await world(luis);
});

describe("acceso: solo el ejecutor, con permisos mínimos", () => {
  it("anon, authenticated y service_role no ejecutan las RPC nuevas", async () => {
    const w = await world(ana);
    const calls = [`select ${stageCall(ana, randomUUID(), 1, 0, w)}`, `select ${completeCall(ana, randomUUID(), 1)}`];
    for (const sql of calls) {
      for (const actor of [{ kind: "anon" }, { kind: "authenticated", userId: ana.id }, { kind: "service_role" }] as const) {
        const result = await psqlAs(actor, `${sql};`);
        expect(result.ok, `${actor.kind}: ${sql.slice(0, 40)}`).toBe(false);
        expect(result.error).toContain(`ERROR:  ${SQLSTATE.permission}:`);
      }
    }
  });

  it("el propietario es galcoa_turn_writer, sin INSERT directo en mensajes y con EXECUTE exacto de F4", async () => {
    const fns = await psqlOk(`select p.proname, pg_get_userbyid(p.proowner), p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''),
        has_function_privilege('galcoa_executor', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_proc p where p.proname in ('stage_chat_turn_proposal', 'complete_chat_turn') order by 1;`);
    expect(fns).toEqual(["complete_chat_turn", "stage_chat_turn_proposal"].map((n) => [n, "galcoa_turn_writer", "t", "search_path=\"\"", "t", "f"]));
    expect(await psqlOk(`select has_table_privilege('galcoa_turn_writer', 'public.messages', 'INSERT'),
      has_function_privilege('galcoa_turn_writer', 'public.append_agent_message(uuid,uuid,text,jsonb,text,text)', 'EXECUTE'),
      has_function_privilege('galcoa_executor', 'public.append_agent_message(uuid,uuid,text,jsonb,text,text)', 'EXECUTE');`)).toEqual([["f", "t", "t"]]);
  });
});

describe("stage: propuesta por intento sin tocar el borrador oficial", () => {
  it("guarda una vez, repite el mismo resultado y no sobrescribe otra propuesta", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    const first = await stage(ana, turnId, 1, 0, w);
    expect(first).toMatchObject({ status: "staged", replayed: false, staged: { expectedDraftRevision: 0, nextDraftRevision: 1 } });
    expect(await published(w.documentId)).toEqual([0, 0, 0]);

    expect(await stage(ana, turnId, 1, 0, w)).toMatchObject({ status: "staged", replayed: true, staged: first.staged });
    expect(await stage(ana, turnId, 1, 0, w, "Otro titulo")).toEqual({ status: "stage_conflict" });
    expect((await psqlOk(`select staged_payload->'content'->>'title' from public.chat_turns where id = ${lit(turnId)};`))[0][0]).toBe("Titulo");
    expect(await count(`public.audit_events where resource_id = ${lit(turnId)} and action = 'chat_turn.staged'`)).toBe(1);
  });

  it("rechaza forma inválida y fuentes ajenas (22023), y no confía en otro actor", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    const bad = [
      { content: { title: "x", body: "y" } },
      { content: { ...contentOf("x"), extra: 1 } },
      { content: { title: " ", body: "y", corrections: [] } },
      { inputs: [] },
      { inputs: [{ ref: "m1", kind: "mensaje", id: foreign.messageId }] },
      { inputs: [{ ref: "e1", kind: "extraccion", id: foreign.extractionId }] },
      { inputs: [{ ref: "m1", kind: "mensaje", id: w.extractionId }] },
      { inputs: [{ ref: "e1", kind: "mensaje", id: w.messageId }] },
      { inputs: [{ ref: "m1", kind: "mensaje", id: w.messageId }, { ref: "m1", kind: "mensaje", id: w.messageId }] },
      { inputs: [{ ref: "b1", kind: "borrador", id: randomUUID() }] },
    ];
    for (const o of bad) {
      await expectRejected(`set role galcoa_executor; select ${stageCall(ana, turnId, 1, 0, w, "Titulo", o)};`, "22023", "supabase_admin");
    }
    expect(await stage(luis, turnId, 1, 0, w)).toEqual({ status: "not_available" });
    expect(await stage(ana, turnId, 1, 3, w)).toEqual({ status: "stale_draft" });
    expect((await psqlOk(`select staged_fingerprint is null from public.chat_turns where id = ${lit(turnId)};`))[0][0]).toBe("t");
  });

  it("exige el mensaje del autor ligado y el intento vigente", async () => {
    const w = await world(ana);
    const bare = (await claim(ana, w.documentId, newClientId())).turn.turnId as string;
    expect(await stage(ana, bare, 1, 0, w)).toEqual({ status: "user_message_required" });
    expect(await stage(ana, bare, 2, 0, w)).toEqual({ status: "stale" });
    expect(await complete(ana, bare, 1)).toEqual({ status: "not_staged" });
  });
});

describe("complete: publicación atómica", () => {
  it("publica borrador, historial, fuentes, mensaje, cierre y auditoría; el replay no duplica", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w, "c".repeat(128));
    const staged = await stage(ana, turnId, 1, 0, w);

    const done = await complete(ana, turnId, 1, "Listo, armé el borrador.");
    expect(done).toMatchObject({
      status: "completed",
      turn: { turnId, state: "completado", attempt: 1 },
      proposalId: staged.staged.proposalId,
      draft: { draftId: staged.staged.draftId, documentId: w.documentId, draftRevision: 1, content: contentOf("Titulo") },
      agentMessage: { sender: "agente", content: "Listo, armé el borrador." },
    });
    expect(await published(w.documentId)).toEqual([1, 1, 1]);
    expect(await count(`public.report_sources where report_id = ${lit(done.proposalId)}`)).toBe(2);
    const report = await psqlOk(`select input->>'kind', output->>'kind', output ? 'draftRevision', output ? 'result', model, prompt_version, rules_version
      from public.verification_reports where id = ${lit(done.proposalId)};`);
    expect(report).toEqual([["redaccion", "redaccion", "f", "f", "modelo-ficticio", "prompt-v1", "redaccion-v1"]]);
    expect((await psqlOk(`select agent_message_id::text, completion_result is not null, staged_payload is null from public.chat_turns where id = ${lit(turnId)};`))[0])
      .toEqual([done.agentMessage.messageId, "t", "t"]);

    const events = await psqlOk(`select action, metadata::text from public.audit_events where resource_id = ${lit(turnId)} order by id;`);
    expect(events.map((e) => e[0])).toEqual(["chat_turn.claimed", "chat_turn.staged", "chat_turn.completed"]);
    expect(JSON.stringify(events)).not.toContain("Cuerpo");

    const replay = await complete(ana, turnId, 1, "Otro texto");
    expect(replay).toMatchObject({ status: "replayed", proposalId: done.proposalId, draft: done.draft, agentMessage: done.agentMessage });
    expect(await complete(ana, turnId, 2)).toEqual({ status: "stale" });
    expect(await published(w.documentId)).toEqual([1, 1, 1]);
    expect(await count(`public.audit_events where resource_id = ${lit(turnId)} and action = 'chat_turn.completed'`)).toBe(1);

    // F7 aún no discrimina tipos de reporte: este historial no debe parecer un contraste.
    const source = await ana.client.rpc("get_freeze_source", { p_document_id: w.documentId });
    expect(source.data).toMatchObject({ draft: { draftId: staged.staged.draftId, draftRevision: 1 }, report: null });
  });

  it("el segundo borrador conserva el ID y avanza; el replay devuelve el original aunque la cabeza avance", async () => {
    const w = await world(ana);
    const one = await openTurn(ana, w);
    await stage(ana, one.turnId, 1, 0, w, "Primero");
    const first = await complete(ana, one.turnId, 1);
    const two = await openTurn(ana, w);
    expect(await stage(ana, two.turnId, 1, 0, w, "Segundo")).toEqual({ status: "stale_draft" });
    expect((await stage(ana, two.turnId, 1, 1, w, "Segundo")).staged).toMatchObject({ draftId: first.draft.draftId, nextDraftRevision: 2 });
    const second = await complete(ana, two.turnId, 1);
    expect(second.draft).toMatchObject({ draftId: first.draft.draftId, draftRevision: 2, content: contentOf("Segundo") });

    await psqlOk(`update public.drafts set draft_revision = 7, content = ${json(contentOf("Otro"))} where document_id = ${lit(w.documentId)};`);
    expect(await complete(ana, one.turnId, 1)).toMatchObject({ status: "replayed", draft: first.draft });
    expect(await complete(ana, two.turnId, 1)).toMatchObject({ status: "replayed", draft: second.draft });
    expect(await published(w.documentId)).toEqual([1, 2, 2]);
  });

  it("CAS: si el borrador cambió tras el stage no se publica nada y el turno sigue en curso", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    await psqlOk(`insert into public.drafts (document_id, draft_revision, content) values (${lit(w.documentId)}, 1, ${json(contentOf("Ajeno"))});`);
    expect(await complete(ana, turnId, 1)).toEqual({ status: "stale_draft" });
    expect(await published(w.documentId)).toEqual([1, 0, 0]);
    expect((await psqlOk(`select state, agent_message_id is null, staged_fingerprint is not null from public.chat_turns where id = ${lit(turnId)};`))[0]).toEqual(["en_curso", "t", "t"]);
  });

  it("rollback total si falla la auditoría: sin borrador, historial, mensaje ni cierre", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    const result = await psql(
      `begin;
create function public.zz_audit_boom() returns trigger language plpgsql as $$ begin raise exception 'boom' using errcode = 'P0001'; end $$;
create trigger zz_audit_boom before insert on public.audit_events for each row when (new.action = 'chat_turn.completed') execute function public.zz_audit_boom();
set local role galcoa_executor;
select ${completeCall(ana, turnId, 1)};
commit;`,
      "supabase_admin",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
    expect(await published(w.documentId)).toEqual([0, 0, 0]);
    expect(await count(`public.idempotency_records where resource_id = ${lit(w.documentId)} and action = 'message.record_agent'`)).toBe(0);
    expect((await psqlOk(`select state, agent_message_id is null, completion_result is null from public.chat_turns where id = ${lit(turnId)};`))[0]).toEqual(["en_curso", "t", "t"]);
    expect((await complete(ana, turnId, 1)).status).toBe("completed");
  });

  it("documento finalizado: no publica nada, conserva el borrador existente y el turno sigue en curso", async () => {
    // Estado técnico inmutable producido por la semilla real de finalización (sin tocar triggers ni guardas).
    // La evidencia sembrada no está aceptada, así que la propuesta cita solo el mensaje del documento.
    const seeded = await seedDocument(ana.id, { withVersion: true });
    const w: World = { documentId: seeded.documentId, messageId: seeded.messageId, extractionId: seeded.extractionId };
    const { turnId } = await openTurn(ana, w);
    const snapshot = () => psqlOk(`select d.draft_revision::text, d.content::text, d.source_refs::text, doc.document_status, doc.last_version_id::text
      from public.drafts d join public.documents doc on doc.id = d.document_id where d.document_id = ${lit(w.documentId)};`);
    const before = await snapshot();
    expect(before[0][3]).toBe("finalizado");
    const baseline = await published(w.documentId);

    const staged = await stage(ana, turnId, 1, Number(before[0][0]), w, "Titulo", { inputs: [{ ref: "m1", kind: "mensaje", id: w.messageId }] });
    expect(staged.status).toBe("staged");
    const audits = () => count(`public.audit_events where resource_id = ${lit(turnId)} and action = 'chat_turn.completed'`);

    expect(await complete(ana, turnId, 1)).toEqual({ status: "document_finalized" });
    expect(await published(w.documentId)).toEqual(baseline);
    expect(await audits()).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect((await psqlOk(`select state, agent_message_id is null, completion_result is null, staged_proposal_id::text = ${lit(staged.staged.proposalId)}
      from public.chat_turns where id = ${lit(turnId)};`))[0]).toEqual(["en_curso", "t", "t", "t"]);
  });

  it("A/B: otro actor no publica ni ve el resultado", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    expect(await complete(luis, turnId, 1)).toEqual({ status: "not_available" });
    expect(await complete(ana, randomUUID(), 1)).toEqual({ status: "not_available" });
    expect(await published(w.documentId)).toEqual([0, 0, 0]);
    await complete(ana, turnId, 1);
    expect(await complete(luis, turnId, 1)).toEqual({ status: "not_available" });
  });
});

describe("fencing: cancelación, lease e intentos", () => {
  it("cancelar tras el stage impide completar; cancelar tras completar no revierte", async () => {
    const w = await world(ana);
    const a = await openTurn(ana, w);
    await stage(ana, a.turnId, 1, 0, w);
    expect((await close(ana, a.turnId, 1)).status).toBe("closed");
    expect((await psqlOk(`select staged_fingerprint is null from public.chat_turns where id = ${lit(a.turnId)};`))[0][0]).toBe("t");
    expect(await complete(ana, a.turnId, 1)).toEqual({ status: "stale" });
    expect(await stage(ana, a.turnId, 1, 0, w)).toEqual({ status: "stale" });
    expect(await published(w.documentId)).toEqual([0, 0, 0]);

    const b = await openTurn(ana, w);
    await stage(ana, b.turnId, 1, 0, w);
    const done = await complete(ana, b.turnId, 1);
    expect(await close(ana, b.turnId, 1)).toEqual({ status: "stale" });
    expect(await complete(ana, b.turnId, 1)).toMatchObject({ status: "replayed", draft: done.draft });
  });

  it("recuperar el lease invalida el staging del intento viejo", async () => {
    const w = await world(ana);
    const { turnId, clientId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    await expire(turnId);
    expect(await complete(ana, turnId, 1)).toEqual({ status: "stale" });
    expect(await stage(ana, turnId, 1, 0, w)).toEqual({ status: "stale" });

    expect(await claim(ana, w.documentId, clientId)).toMatchObject({ status: "claimed", retried: true, turn: { attempt: 2 } });
    expect((await psqlOk(`select staged_proposal_id is null, staged_payload is null from public.chat_turns where id = ${lit(turnId)};`))[0]).toEqual(["t", "t"]);
    expect(await complete(ana, turnId, 1)).toEqual({ status: "stale" });
    expect(await complete(ana, turnId, 2)).toEqual({ status: "not_staged" });

    expect((await stage(ana, turnId, 2, 0, w)).status).toBe("staged");
    expect(await stage(ana, turnId, 1, 0, w)).toEqual({ status: "stale" });
    expect(await complete(ana, turnId, 1)).toEqual({ status: "stale" });
    expect(await complete(ana, turnId, 2)).toMatchObject({ status: "completed", turn: { attempt: 2 } });
    expect(await published(w.documentId)).toEqual([1, 1, 1]);
  });

  it("con el lease vencido el completion no publica aunque haya staging", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    await expire(turnId);
    expect(await complete(ana, turnId, 1)).toEqual({ status: "stale" });
    expect(await published(w.documentId)).toEqual([0, 0, 0]);
  });
});

describe("concurrencia", () => {
  it("dos completions simultáneos: uno publica y el otro repite el mismo resultado", async () => {
    const w = await world(ana);
    const { turnId } = await openTurn(ana, w);
    await stage(ana, turnId, 1, 0, w);
    const script = `begin;\nset local role galcoa_executor;\nselect pg_backend_pid();\nselect ${completeCall(ana, turnId, 1)};\nselect pg_sleep(0.5);\ncommit;`;
    const results = await Promise.all([psql(script, "supabase_admin"), psql(script, "supabase_admin")]);
    expect(results.every((r) => r.ok), results.map((r) => r.error).join()).toBe(true);
    expect(new Set(results.map((r) => r.rows[0][0])).size).toBe(2);
    const outcomes = results.map((r) => JSON.parse(r.rows[1].join("|")));
    expect(outcomes.map((o) => o.status).sort()).toEqual(["completed", "replayed"]);
    expect(outcomes[0].agentMessage.messageId).toBe(outcomes[1].agentMessage.messageId);
    expect(await published(w.documentId)).toEqual([1, 1, 1]);
  });
});
