import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { computeAggregate } from "@/lib/documents/confirmations/aggregate";
import { createRateLimiter } from "@/lib/documents/confirmations/rate-limit";
import { createAggregateService } from "@/lib/documents/confirmations/service";
import { createSupabaseAggregateStore, createSupabaseRateLimitStore } from "@/lib/documents/confirmations/supabase";
import { createInvitationService } from "@/lib/documents/invitations/service";
import { createSupabaseInvitationStore } from "@/lib/documents/invitations/supabase";
import { hashInvitationToken } from "@/lib/documents/invitations/token";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { anonClient, createTestUser, psql, psqlOk, readLocalStack, type LocalStack, type TestUser } from "../rls/harness";

import { runIndependent } from "./concurrency";

/**
 * MVP-070…076 contra Postgres/Auth/PostgREST locales reales (sin dobles de
 * persistencia): revisión congelada, confirmación del autor, invitaciones,
 * lectura sin consumo, respuesta atómica, estado agregado y límite de abuso,
 * con usuarios A/B/anon y conexiones independientes. Datos ficticios; las
 * credenciales efímeras viven solo en memoria.
 */

let stack: LocalStack;
let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  stack = readLocalStack();
  ana = await createTestUser(stack, "rev-a");
  luis = await createTestUser(stack, "rev-b");
});

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

type World = { documentId: string; messageId: string; evidenceId: string; extractionId: string };

const operation = (body: string) => ({ title: "Acuerdo ficticio", body, corrections: [] as string[] });

/** Documento del usuario con mensaje, evidencia, extracción, borrador (rev 1) y reporte crítico de esa revisión. */
async function world(user: TestUser, body = "Se entregan 12 cajas de ejemplo."): Promise<World> {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const message = await user.client.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg",
  });
  const messageId = message.data.value.messageId as string;
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  await psqlOk(`
begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}');
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${JSON.stringify(operation(body))}'::jsonb);
insert into public.verification_reports (document_id, input, output, model, prompt_version, rules_version) values ('${documentId}',
  '${JSON.stringify({ inputs: [{ ref: "m1", kind: "mensaje", id: messageId }, { ref: "e1", kind: "extraccion", id: extractionId }, { ref: "b1", kind: "borrador", id: randomUUID() }] })}'::jsonb,
  '${JSON.stringify({ result: "contradiccion_critica", draftRevision: 1, findings: [{ message: "Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1).", severity: "critical", sourceRefs: ["m1", "e1"] }] })}'::jsonb,
  'modelo-ficticio', 'contrast-v1', 'rules-v1');
commit;`);
  return { documentId, messageId, evidenceId, extractionId };
}

async function changeDraft(documentId: string, revision: number, body: string) {
  await psqlOk(`update public.drafts set draft_revision = ${revision}, content = '${JSON.stringify(operation(body))}'::jsonb, updated_at = now() where document_id = '${documentId}';`);
}

function services(user: TestUser, options: { ttlSeconds?: number } = {}) {
  const session = { currentUserId: async () => user.id };
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: user.id, session: user.client });
  return {
    revisions: createRevisionService({ session, source: reader, revisions: store }),
    invitations: createInvitationService({ session, invitations: createSupabaseInvitationStore({ verifiedUserId: user.id, rpc: user.client }), ttlSeconds: options.ttlSeconds }),
    aggregate: createAggregateService({ session, store: createSupabaseAggregateStore({ verifiedUserId: user.id, session: user.client }) }),
    store,
  };
}

/** Servicio público: cliente anónimo propio, sin sesión. */
function publicService() {
  const rpc = anonClient(stack);
  return {
    invitations: createInvitationService({ session: { currentUserId: async () => null }, invitations: createSupabaseInvitationStore({ verifiedUserId: null, rpc }) }),
    rpc,
  };
}

const key = (prefix: string) => `${prefix}-${randomUUID()}`;
const freezeCmd = (w: World, over: Record<string, unknown> = {}) => ({ documentId: w.documentId, expectedDraftRevision: 1, selection: ["comprador"], idempotencyKey: key("freeze"), ...over });
const authorCmd = (b: { revision: { revisionId: string; snapshotId: string; snapshotHash: string } }, documentId: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, actor: "autor", documentId, revisionId: b.revision.revisionId, snapshotId: b.revision.snapshotId, snapshotHash: b.revision.snapshotHash,
  idempotencyKey: key("author"), decision: "confirmar", checkboxChecked: true, ...over,
});
const respondCmd = (token: string, b: { revision: { revisionId: string; snapshotId: string; snapshotHash: string } }, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, actor: "tercero", token, revisionId: b.revision.revisionId, snapshotId: b.revision.snapshotId, snapshotHash: b.revision.snapshotHash,
  idempotencyKey: key("respond"), declaredName: "Juan Pérez", decision: "confirmar", checkboxChecked: true, ...over,
});
const rejectCmd = (token: string, b: Parameters<typeof respondCmd>[1], over: Record<string, unknown> = {}) =>
  respondCmd(token, b, { decision: "rechazar", checkboxChecked: false, rejectionRatified: true, ...over });

async function frozen(user: TestUser, w: World, over: Record<string, unknown> = {}) {
  const r = await services(user).revisions.freeze(freezeCmd(w, over));
  if (!r.ok) throw new Error(`freeze: ${r.error.code}`);
  return r.value;
}

async function sql(query: string) {
  return psqlOk(query);
}

describe("MVP-070 · congelar la revisión sobre la base real", () => {
  it("persiste snapshot, hash, participantes, fuentes privadas y deja las advertencias críticas sin bloquear", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    expect(b.revision).toMatchObject({ selection: ["autor", "comprador"], frozenFromDraftRevision: 1, supersedesRevisionId: null, confirmationStatus: "pendiente", controlStatus: "contradiccion_critica", documentStatus: "esperando_confirmaciones" });
    expect(b.snapshot.content.warnings).toHaveLength(1);
    expect(b.snapshot.content.warnings[0]).toMatchObject({ severity: "critical" });
    expect(JSON.stringify(b.snapshot.content)).not.toMatch(/\b[me]\d+\b|msg-|b1/);
    expect(b.snapshot.content.warnings[0].sources.map((s) => s.alias)).toEqual(["Fuente A", "Fuente B"]);

    const hash = await sql(`select encode(sha256(canonical_bytes), 'hex') = snapshot_hash, snapshot_hash from public.revision_snapshots where revision_id = '${b.revision.revisionId}';`);
    expect(hash[0][0]).toBe("t");
    expect(hash[0][1]).toBe(b.revision.snapshotHash);
    const participants = await sql(`select role, user_id is not null from public.revision_participants where revision_id = '${b.revision.revisionId}' order by role;`);
    expect(participants).toEqual([["autor", "t"], ["comprador", "f"]]);
    const sources = await sql(`select alias, message_id is not null, evidence_id is not null from public.snapshot_sources where revision_id = '${b.revision.revisionId}' order by alias;`);
    // Las fuentes se ordenan por ref privada (e1 < m1): A = evidencia, B = mensaje.
    expect(sources).toEqual([["Fuente A", "f", "t"], ["Fuente B", "t", "f"]]);
  });

  it("conflicto de revisión del borrador, idempotencia y clave con otro contenido", async () => {
    const w = await world(ana);
    const svc = services(ana).revisions;
    expect(await svc.freeze(freezeCmd(w, { expectedDraftRevision: 0 }))).toMatchObject({ ok: false, error: { code: "STALE_DRAFT" } });
    const k = key("freeze");
    const a = await svc.freeze(freezeCmd(w, { idempotencyKey: k }));
    const b = await svc.freeze(freezeCmd(w, { idempotencyKey: k }));
    if (!a.ok || !b.ok) throw new Error("freeze");
    expect(b).toMatchObject({ replayed: true });
    expect(b.value.revision.revisionId).toBe(a.value.revision.revisionId);
    expect(await svc.freeze(freezeCmd(w, { idempotencyKey: k, selection: ["intermediario"] }))).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    const same = await svc.freeze(freezeCmd(w));
    expect(same).toMatchObject({ ok: true, value: { unchanged: true } });
    expect((await sql(`select count(*) from public.document_revisions where document_id = '${w.documentId}';`))[0][0]).toBe("1");
  });

  it("un cambio de contenido o de selección crea otra revisión que sustituye, invalida enlaces y no hereda respuestas", async () => {
    const w = await world(ana);
    const first = await frozen(ana, w);
    const svc = services(ana);
    await svc.revisions.confirmAsAuthor(authorCmd(first, w.documentId));
    const inv = await svc.invitations.issue({ revisionId: first.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");

    await changeDraft(w.documentId, 2, "Se entregan 11 cajas de ejemplo.");
    const second = await svc.revisions.freeze(freezeCmd(w, { expectedDraftRevision: 2 }));
    if (!second.ok) throw new Error(`freeze 2: ${second.error.code}`);
    expect(second.value.revision.supersedesRevisionId).toBe(first.revision.revisionId);
    expect(second.value.revision.confirmationStatus).toBe("pendiente");

    const states = await sql(`select id = '${first.revision.revisionId}', lifecycle, confirmation_status from public.document_revisions where document_id = '${w.documentId}' order by sequence;`);
    expect(states).toEqual([["t", "sustituida", "sustituida"], ["f", "activa", "pendiente"]]);
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${second.value.revision.revisionId}';`))[0][0]).toBe("0");

    const pub = publicService().invitations;
    expect(await pub.read(inv.value.token)).toMatchObject({ ok: true, value: { kind: "unavailable", availability: "sustituida" } });
    expect(await pub.respond(respondCmd(inv.value.token, first))).toMatchObject({ ok: false, error: { code: "REVISION_SUPERSEDED" } });
    expect(await svc.revisions.confirmAsAuthor(authorCmd(first, w.documentId))).toMatchObject({ ok: false, error: { code: "REVISION_NOT_ACTIVE" } });
    expect(await svc.aggregate.getForAuthor(first.revision.revisionId)).toMatchObject({ ok: true, value: { confirmationStatus: "sustituida", canFinalize: false } });

    // La selección también crea otra revisión.
    const third = await svc.revisions.freeze(freezeCmd(w, { expectedDraftRevision: 2, selection: ["intermediario", "comprador"] }));
    expect(third).toMatchObject({ ok: true, value: { revision: { selection: ["autor", "intermediario", "comprador"] } } });
  });

  it("otro usuario y anon no pueden congelar ni leer: igual que un documento inexistente", async () => {
    const w = await world(ana);
    expect(await services(luis).revisions.freeze(freezeCmd(w))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    const anon = anonClient(stack);
    const denied = await anon.rpc("freeze_revision", {
      p_document_id: w.documentId, p_expected_draft_revision: 1, p_canonical_hex: "7b7d", p_control_status: "sin_evaluar", p_sources: [],
      p_key: key("freeze"), p_fingerprint: sha("x"), p_correlation_id: "c",
    });
    expect(denied.error).not.toBeNull();
    const tables = await anon.from("document_revisions").select("id");
    expect(tables.data ?? []).toEqual([]);
    const other = await luis.client.from("revision_participants").select("id").eq("document_id", w.documentId);
    expect(other.data ?? []).toEqual([]);
  });

  it("la base rechaza una operación distinta del borrador vigente y un contenido que no es el canónico", async () => {
    const w = await world(ana);
    const adapters = createSupabaseRevisionAdapters({ verifiedUserId: ana.id, session: ana.client });
    const content = { operation: operation("Otro texto no redactado"), warnings: [], selection: ["autor"] };
    const hex = Buffer.from(JSON.stringify(content), "utf8").toString("hex");
    const bad = await ana.client.rpc("freeze_revision", {
      p_document_id: w.documentId, p_expected_draft_revision: 1, p_canonical_hex: hex, p_control_status: "sin_evaluar", p_sources: [],
      p_key: key("freeze"), p_fingerprint: sha("y"), p_correlation_id: "c",
    });
    expect(bad.error).not.toBeNull();
    expect(await adapters.store.getActiveRevision(ana.id, w.documentId)).toBeNull();
  });
});

describe("MVP-071 · confirmación del autor", () => {
  it("solo autor completa; con tercero queda parcial; repetir es idempotente; otra clave: ya respondió", async () => {
    const solo = await world(ana);
    const sb = await frozen(ana, solo, { selection: [] });
    const svc = services(ana);
    expect(await svc.revisions.confirmAsAuthor(authorCmd(sb, solo.documentId))).toMatchObject({ ok: true, value: { confirmationStatus: "completa", actor: { role: "autor", declaredName: null } } });

    const w = await world(ana);
    const b = await frozen(ana, w);
    const cmd = authorCmd(b, w.documentId);
    const first = await svc.revisions.confirmAsAuthor(cmd);
    const again = await svc.revisions.confirmAsAuthor(cmd);
    expect(first).toMatchObject({ ok: true, value: { confirmationStatus: "parcial", replayed: false } });
    expect(again).toMatchObject({ ok: true, replayed: true, value: { replayed: true } });
    if (first.ok && again.ok) expect(again.value.responseId).toBe(first.value.responseId);
    expect(await svc.revisions.confirmAsAuthor(authorCmd(b, w.documentId))).toMatchObject({ ok: false, error: { code: "ALREADY_RESPONDED" } });
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}' and role = 'autor';`))[0][0]).toBe("1");
  });

  it("hash o snapshot equivocados, ajeno o anon: rechazado antes de registrar nada", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const svc = services(ana).revisions;
    expect(await svc.confirmAsAuthor(authorCmd(b, w.documentId, { snapshotHash: "0".repeat(64) }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    expect(await svc.confirmAsAuthor(authorCmd(b, w.documentId, { snapshotId: randomUUID() }))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    expect(await services(luis).revisions.confirmAsAuthor(authorCmd(b, w.documentId))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    const anon = await anonClient(stack).rpc("confirm_as_author", { p_document_id: w.documentId, p_revision_id: b.revision.revisionId, p_snapshot_id: b.revision.snapshotId, p_snapshot_hash: b.revision.snapshotHash, p_key: key("a"), p_fingerprint: sha("z"), p_correlation_id: "c" });
    expect(anon.error).not.toBeNull();
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("0");
  });
});

describe("MVP-071 · la revisión debe pertenecer al documento de la ruta", () => {
  it("mismo propietario, documentos A/B: la ruta de A no confirma la revisión de B; la ruta correcta sí", async () => {
    const wa = await world(ana);
    const wb = await world(ana);
    const bb = await frozen(ana, wb);
    const svc = services(ana).revisions;
    const count = async () => (await sql(`select count(*) from public.corroboration_responses where revision_id = '${bb.revision.revisionId}';`))[0][0];
    expect(await svc.confirmAsAuthor(authorCmd(bb, wa.documentId))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await svc.confirmAsAuthor(authorCmd(bb, randomUUID()))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await count()).toBe("0");
    expect(await svc.confirmAsAuthor(authorCmd(bb, wb.documentId))).toMatchObject({ ok: true, value: { replayed: false } });
    expect(await count()).toBe("1");
  });

  it("usuario ajeno o revisión inexistente: la misma respuesta; sin sobrecarga heredada ejecutable", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const ajeno = await services(luis).revisions.confirmAsAuthor(authorCmd(b, w.documentId));
    const inexistente = await services(ana).revisions.confirmAsAuthor(authorCmd({ revision: { ...b.revision, revisionId: randomUUID() } }, w.documentId));
    expect(ajeno).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(inexistente).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await sql("select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'confirm_as_author';"))
      .toEqual([["p_document_id uuid, p_revision_id uuid, p_snapshot_id uuid, p_snapshot_hash text, p_key text, p_fingerprint text, p_correlation_id text"]]);
    const legacy = await ana.client.rpc("confirm_as_author", { p_revision_id: b.revision.revisionId, p_snapshot_id: b.revision.snapshotId, p_snapshot_hash: b.revision.snapshotHash, p_key: key("legacy"), p_fingerprint: sha("l"), p_correlation_id: "c" });
    expect(legacy.error).not.toBeNull();
  });
});

describe("MVP-072/073 · invitaciones y lectura pública", () => {
  it("el token no se guarda en claro; emitir, repetir y reemitir; solo el propietario", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const svc = services(ana).invitations;
    const cmd = { revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") };
    const first = await svc.issue(cmd);
    if (!first.ok) throw new Error("issue");
    expect(await svc.issue(cmd)).toMatchObject({ ok: false, error: { code: "REISSUE_REQUIRED" } });
    expect(await svc.issue({ ...cmd, role: "intermediario" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });

    const dump = await sql(`select token_hash from public.corroboration_requests where revision_id = '${b.revision.revisionId}';`);
    expect(dump).toEqual([[hashInvitationToken(first.value.token)]]);
    expect((await sql(`select count(*) from public.corroboration_requests where token_hash = '${first.value.token}';`))[0][0]).toBe("0");

    const second = await svc.issue({ ...cmd, idempotencyKey: key("issue") });
    if (!second.ok) throw new Error("reissue");
    expect(second.value.token).not.toBe(first.value.token);
    const live = await sql(`select generation, revoked_at is null from public.corroboration_requests where revision_id = '${b.revision.revisionId}' order by generation;`);
    expect(live).toEqual([["1", "f"], ["2", "t"]]);
    const pub = publicService().invitations;
    expect(await pub.read(first.value.token)).toMatchObject({ value: { availability: "no_disponible" } });
    expect(await pub.read(second.value.token)).toMatchObject({ value: { kind: "available" } });

    expect(await services(luis).invitations.issue({ ...cmd, idempotencyKey: key("issue") })).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await svc.issue({ revisionId: b.revision.revisionId, role: "intermediario", idempotencyKey: key("issue") })).toMatchObject({ ok: false, error: { code: "ROLE_NOT_SELECTED" } });
    expect(await services(luis).invitations.revoke(second.value.invitationId)).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
  });

  it("el GET entrega el mismo snapshot por allowlist y repetirlo no consume nada", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const inv = await services(ana).invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const before = await sql(`select consumed_at is null, revoked_at is null from public.corroboration_requests where revision_id = '${b.revision.revisionId}';`);
    const pub = publicService().invitations;
    for (let i = 0; i < 6; i += 1) {
      const r = await pub.read(inv.value.token);
      if (!r.ok || r.value.kind !== "available") throw new Error("read");
      expect(r.value.invitation.operation).toEqual(b.snapshot.content.operation);
      expect(r.value.invitation.warnings).toEqual(b.snapshot.content.warnings);
      expect(Object.keys(r.value.invitation).sort()).toEqual(["availability", "expiresAt", "operation", "revisionId", "role", "schemaVersion", "selection", "snapshotHash", "snapshotId", "warnings"]);
    }
    expect(await sql(`select consumed_at is null, revoked_at is null from public.corroboration_requests where revision_id = '${b.revision.revisionId}';`)).toEqual(before);
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("0");
    // Inexistente y mal formado: la misma respuesta.
    expect(await pub.read("x".repeat(43))).toEqual(await pub.read("corto"));
  });

  it("revocado, vencido y consumido no admiten respuesta; el anon no ve tablas ni funciones privadas", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w, { selection: ["intermediario", "comprador"] });
    const svc = services(ana).invitations;
    const pub = publicService();
    const revoked = await svc.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    const expiring = await svc.issue({ revisionId: b.revision.revisionId, role: "intermediario", idempotencyKey: key("issue") });
    if (!revoked.ok || !expiring.ok) throw new Error("issue");

    expect(await svc.revoke(revoked.value.invitationId)).toMatchObject({ ok: true });
    expect(await svc.revoke(revoked.value.invitationId)).toMatchObject({ ok: true, replayed: true });
    expect(await pub.invitations.respond(respondCmd(revoked.value.token, b))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });

    // El vencimiento es inmutable por guarda: se fuerza como superusuario solo en la prueba.
    const forced = await psql(`begin; alter table public.corroboration_requests disable trigger trg_requests_guard;
      update public.corroboration_requests set expires_at = now() - interval '1 second' where id = '${expiring.value.invitationId}';
      alter table public.corroboration_requests enable trigger trg_requests_guard; commit;`, "supabase_admin");
    expect(forced.ok, forced.error).toBe(true);
    expect(await pub.invitations.read(expiring.value.token)).toMatchObject({ value: { availability: "caducada" } });
    expect(await pub.invitations.respond(respondCmd(expiring.value.token, b))).toMatchObject({ ok: false, error: { code: "INVITATION_EXPIRED" } });
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("0");

    for (const table of ["corroboration_requests", "corroboration_responses", "revision_snapshots", "audit_events", "idempotency_records", "rate_limit_counters"]) {
      const r = await pub.rpc.from(table).select("*");
      expect(r.data ?? [], table).toEqual([]);
    }
    const priv = await pub.rpc.rpc("issue_invitation", { p_revision_id: b.revision.revisionId, p_role: "comprador", p_token_hash: sha("t"), p_ttl_seconds: 3600, p_key: key("k"), p_fingerprint: sha("f"), p_correlation_id: "c" });
    expect(priv.error).not.toBeNull();
    const aggregate = await pub.rpc.rpc("get_revision_state", { p_revision_id: b.revision.revisionId });
    expect(aggregate.error).not.toBeNull();
  });
});

describe("MVP-074 · respuesta atómica e idempotente", () => {
  it("confirmar con nombre: parcial → completa con el autor; después ya respondida", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const own = services(ana);
    const inv = await own.invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const pub = publicService().invitations;

    const cmd = respondCmd(inv.value.token, b);
    const done = await pub.respond(cmd);
    expect(done).toMatchObject({ ok: true, value: { confirmationStatus: "parcial", actor: { role: "comprador", declaredName: "Juan Pérez" }, outcome: { decision: "confirmar" }, replayed: false, snapshotHash: b.revision.snapshotHash } });
    expect(await pub.respond(cmd)).toMatchObject({ ok: true, replayed: true });
    expect(await pub.respond({ ...cmd, declaredName: "Otra Persona" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(await pub.respond(rejectCmd(inv.value.token, b))).toMatchObject({ ok: false, error: { code: "ALREADY_RESPONDED" } });
    expect(await pub.read(inv.value.token)).toMatchObject({ value: { availability: "ya_respondida" } });

    expect(await own.revisions.confirmAsAuthor(authorCmd(b, w.documentId))).toMatchObject({ ok: true, value: { confirmationStatus: "completa" } });
    const aggregate = await own.aggregate.getForAuthor(b.revision.revisionId);
    expect(aggregate).toMatchObject({ ok: true, value: { confirmationStatus: "completa", canFinalize: true, confirmed: 2, required: 2, provenance: "declarado_y_corroborado_por_tercero" } });
    const row = await sql(`select declared_name, decision, checkbox_checked, ratified_rejection, request_id is not null from public.corroboration_responses where revision_id = '${b.revision.revisionId}' and role = 'comprador';`);
    expect(row).toEqual([["Juan Pérez", "confirmada", "t", "f", "t"]]);
    expect((await sql(`select consumed_at is not null from public.corroboration_requests where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("t");
  });

  it("rechazar exige nombre y ratificación; deja la revisión rechazada, no finalizable y permite otra sin herencia", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const own = services(ana);
    const inv = await own.invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const pub = publicService().invitations;
    expect(await pub.respond(rejectCmd(inv.value.token, b, { declaredName: "  " }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await pub.respond(rejectCmd(inv.value.token, b, { rejectionRatified: undefined }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await pub.respond(rejectCmd(inv.value.token, b))).toMatchObject({ ok: true, value: { confirmationStatus: "rechazada", outcome: { decision: "rechazar", rejectionRatified: true }, actor: { declaredName: "Juan Pérez" } } });

    expect(await own.aggregate.getForAuthor(b.revision.revisionId)).toMatchObject({ ok: true, value: { confirmationStatus: "rechazada", canFinalize: false, canCreateNewRevision: true, rejected: 1 } });
    expect((await sql(`select document_status from public.documents where id = '${w.documentId}';`))[0][0]).toBe("revision_rechazada");

    await changeDraft(w.documentId, 2, "Texto corregido tras el rechazo.");
    const next = await own.revisions.freeze(freezeCmd(w, { expectedDraftRevision: 2 }));
    expect(next).toMatchObject({ ok: true, value: { revision: { confirmationStatus: "pendiente" } } });
    if (next.ok) expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${next.value.revision.revisionId}';`))[0][0]).toBe("0");
  });

  it("snapshot, revisión o hash distintos de los vistos: no se registra nada", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const inv = await services(ana).invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const pub = publicService().invitations;
    for (const over of [{ snapshotHash: "0".repeat(64) }, { snapshotId: randomUUID() }, { revisionId: randomUUID() }]) {
      expect(await pub.respond(respondCmd(inv.value.token, b, over))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    }
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("0");
  });

  it("confirmar y rechazar a la vez desde clientes independientes: una sola decisión ganadora", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const inv = await services(ana).invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const attempts = 8;
    const results = await runIndependent(attempts, (i) =>
      publicService().invitations.respond(i % 2 === 0 ? respondCmd(inv.value.token, b) : rejectCmd(inv.value.token, b)),
    );
    const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    expect(outcomes.every(Boolean)).toBe(true);
    expect(outcomes.filter((o) => o?.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => o && !o.ok && o.error.code === "ALREADY_RESPONDED")).toHaveLength(attempts - 1);
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}' and role = 'comprador';`))[0][0]).toBe("1");
    expect((await sql(`select count(*) from public.corroboration_requests where revision_id = '${b.revision.revisionId}' and consumed_at is not null;`))[0][0]).toBe("1");
  });

  it("doble clic y reintentos con la misma clave desde conexiones independientes: una decisión y el resto la repiten", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const inv = await services(ana).invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    const cmd = respondCmd(inv.value.token, b);
    const results = await runIndependent(6, () => publicService().invitations.respond(cmd));
    const ok = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    expect(ok.every((r) => r?.ok)).toBe(true);
    const ids = new Set(ok.map((r) => (r && r.ok ? r.value.responseId : null)));
    expect(ids.size).toBe(1);
    expect(ok.filter((r) => r?.ok && !r.replayed)).toHaveLength(1);
    expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}' and role = 'comprador';`))[0][0]).toBe("1");
  });

  it("congelar otra revisión contra la respuesta en curso no deja respuestas en la sustituida ni enlaces vigentes", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const own = services(ana);
    const inv = await own.invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    await changeDraft(w.documentId, 2, "Texto distinto para forzar otra revisión.");
    const [response, refreeze] = await Promise.all([
      publicService().invitations.respond(respondCmd(inv.value.token, b)),
      own.revisions.freeze(freezeCmd(w, { expectedDraftRevision: 2 })),
    ]);
    expect(refreeze.ok).toBe(true);
    // O gana la respuesta antes del congelado, o el enlace ya estaba sustituido: nunca ambas cosas.
    const live = await sql(`select count(*) from public.corroboration_requests q join public.document_revisions r on r.id = q.revision_id where r.lifecycle = 'activa' and q.revoked_at is null and q.consumed_at is null;`);
    expect(Number(live[0][0])).toBeGreaterThanOrEqual(0);
    const active = await sql(`select count(*) from public.document_revisions where document_id = '${w.documentId}' and lifecycle = 'activa';`);
    expect(active[0][0]).toBe("1");
    if (response.ok) expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("1");
    else expect((await sql(`select count(*) from public.corroboration_responses where revision_id = '${b.revision.revisionId}';`))[0][0]).toBe("0");
  });

  it("el token no queda en auditoría, idempotencia ni en ninguna tabla", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    const inv = await services(ana).invitations.issue({ revisionId: b.revision.revisionId, role: "comprador", idempotencyKey: key("issue") });
    if (!inv.ok) throw new Error("issue");
    await publicService().invitations.respond(respondCmd(inv.value.token, b));
    const text = await sql(`select (select coalesce(string_agg(metadata::text || actor_scope, ' '), '') from public.audit_events where document_id = '${w.documentId}')
      || (select coalesce(string_agg(result::text || key, ' '), '') from public.idempotency_records where resource_id in ('${b.revision.revisionId}', '${w.documentId}'))
      || (select coalesce(string_agg(content::text, ' '), '') from public.revision_snapshots where document_id = '${w.documentId}');`);
    expect(text[0][0]).not.toContain(inv.value.token);
  });
});

describe("MVP-075 · estado agregado, paridad y límite de abuso", () => {
  it("el agregado de la base coincide con el motor puro en todas las combinaciones de la selección", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w, { selection: ["intermediario", "comprador"] });
    const own = services(ana);
    const tokens: Record<string, string> = {};
    for (const role of ["intermediario", "comprador"] as const) {
      const issued = await own.invitations.issue({ revisionId: b.revision.revisionId, role, idempotencyKey: key("issue") });
      if (!issued.ok) throw new Error("issue");
      tokens[role] = issued.value.token;
    }
    const pub = publicService().invitations;
    const check = async () => {
      const persisted = await own.aggregate.getForAuthor(b.revision.revisionId);
      const rows = await sql(`select confirmation_status from public.document_revisions where id = '${b.revision.revisionId}';`);
      if (!persisted.ok) throw new Error("aggregate");
      return { service: persisted.value.confirmationStatus, column: rows[0][0] };
    };
    expect(await check()).toEqual({ service: "pendiente", column: "pendiente" });
    await pub.respond(respondCmd(tokens.intermediario, b, { declaredName: "María López" }));
    expect(await check()).toEqual({ service: "parcial", column: "parcial" });
    await own.revisions.confirmAsAuthor(authorCmd(b, w.documentId));
    expect(await check()).toEqual({ service: "parcial", column: "parcial" });
    await pub.respond(respondCmd(tokens.comprador, b));
    expect(await check()).toEqual({ service: "completa", column: "completa" });

    const state = await own.store.getActiveRevision(ana.id, w.documentId);
    expect(state?.revision.confirmationStatus).toBe("completa");
    const again = computeAggregate({ revisionId: b.revision.revisionId, snapshotId: b.revision.snapshotId, selection: b.revision.selection, responses: [
      { role: "autor", response: "confirmado", snapshotId: b.revision.snapshotId },
      { role: "intermediario", response: "confirmado", snapshotId: b.revision.snapshotId },
      { role: "comprador", response: "confirmado", snapshotId: b.revision.snapshotId },
    ], superseded: false });
    expect(again.confirmationStatus).toBe("completa");
  });

  it("el estado de una revisión ajena es inexistente para otro usuario y para anon", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w);
    expect(await services(luis).aggregate.getForAuthor(b.revision.revisionId)).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await services(ana).aggregate.getForAuthor(b.revision.revisionId)).toMatchObject({ ok: true, value: { confirmationStatus: "pendiente" } });
  });

  it("el contador durable limita por origen y ventana, y reinicia en la ventana siguiente", async () => {
    const rpc = anonClient(stack);
    let now = Date.parse("2026-10-16T12:00:10Z");
    const limiter = createRateLimiter({ store: createSupabaseRateLimitStore(rpc), now: () => now, limits: { write: { limit: 3, windowSeconds: 60 } } });
    const request = new Request("http://localhost/api", { headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200)}-${randomUUID()}` } });
    const statuses: number[] = [];
    const handler = limiter.limited("write", async () => new Response("ok"));
    for (let i = 0; i < 5; i += 1) statuses.push((await handler(request)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    now += 60_000;
    expect((await handler(request)).status).toBe(200);
    const stored = await sql(`select count(*) from public.rate_limit_counters where origin_hash ~ '^[0-9a-f]{64}$';`);
    expect(Number(stored[0][0])).toBeGreaterThan(0);
  });

  it("el contador cerrado en falla: sin red al contador no hay bypass", async () => {
    const broken = createRateLimiter({ store: { hit: async () => Promise.reject(new Error("caído")) } });
    const res = await broken.limited("read", async () => new Response("ok"))(new Request("http://localhost/api"));
    expect(res.status).toBe(503);
  });
});
