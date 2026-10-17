import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { createTestUser, psqlOk, readLocalStack, type TestUser } from "../rls/harness";

import { runIndependent } from "./concurrency";

/**
 * MVP-080 · reclamo de finalización (migración 02504) contra Postgres/Auth/PostgREST locales reales:
 * elegibilidad bajo lock (incluida la invariante `frozen_from_draft_revision = drafts.draft_revision`),
 * una operación por revisión, lease/fencing, reanudación y respaldo contra congelar durante un claim.
 * Datos ficticios; no hay PDF, Storage ni HCS.
 */

let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  const stack = readLocalStack();
  ana = await createTestUser(stack, "clm-a");
  luis = await createTestUser(stack, "clm-b");
});

const operation = (body: string) => ({ title: "Acuerdo ficticio", body, corrections: [] as string[] });
const key = (prefix: string) => `${prefix}-${randomUUID()}`;

/** Documento con un borrador en la revisión 1 (sin reportes: las advertencias no bloquean). */
async function world(user: TestUser) {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: key("doc"), p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const message = await user.client.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: key("msg"), p_correlation_id: "corr-msg",
  });
  const messageId = message.data.value.messageId as string;
  await psqlOk(`insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${JSON.stringify(operation("Se entregan 12 cajas."))}'::jsonb);`);
  return { documentId, messageId };
}

const changeDraft = (documentId: string, revision: number) =>
  psqlOk(`update public.drafts set draft_revision = ${revision}, content = '${JSON.stringify(operation(`Versión ${revision}`))}'::jsonb, updated_at = now() where document_id = '${documentId}';`);

function revisions(user: TestUser) {
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: user.id, session: user.client });
  return createRevisionService({ session: { currentUserId: async () => user.id }, source: reader, revisions: store });
}

async function frozen(user: TestUser, documentId: string, expectedDraftRevision = 1) {
  const r = await revisions(user).freeze({ documentId, expectedDraftRevision, selection: ["autor"], idempotencyKey: key("freeze") });
  if (!r.ok) throw new Error(`freeze: ${r.error.code}`);
  return r.value;
}

async function confirmed(user: TestUser, documentId: string, expectedDraftRevision = 1) {
  const b = await frozen(user, documentId, expectedDraftRevision);
  const r = await revisions(user).confirmAsAuthor({
    schemaVersion: 1, actor: "autor", documentId, revisionId: b.revision.revisionId, snapshotId: b.revision.snapshotId,
    snapshotHash: b.revision.snapshotHash, idempotencyKey: key("author"), decision: "confirmar", checkboxChecked: true,
  });
  if (!r.ok) throw new Error(`confirm: ${r.error.code}`);
  return b.revision.revisionId;
}

const claim = async (user: TestUser, documentId: string, revisionId: string) => {
  const { data, error } = await user.client.rpc("claim_finalization", {
    p_document_id: documentId, p_revision_id: revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 60, p_correlation_id: "corr-claim",
  });
  if (error) throw new Error(error.message);
  return data as { status: string; operation?: Record<string, unknown> };
};

const operations = (documentId: string) => psqlOk(`select phase, status, fencing from public.finalization_operations where document_id = '${documentId}';`);

describe("MVP-080 · claim_finalization sobre la base real", () => {
  it("reclama con todas las confirmaciones: reserva identidad, fencing 1 y auditoría; sin PDF", async () => {
    const w = await world(ana);
    const revisionId = await confirmed(ana, w.documentId);
    const r = await claim(ana, w.documentId, revisionId);
    expect(r.status).toBe("claimed");
    expect(r.operation).toMatchObject({ revisionId, phase: "reserved", status: "active", fencing: 1, versionNumber: 1, previousVersionId: null, renderer: "react-pdf-v1" });
    const stored = await psqlOk(`select public_reference ~ '^[0-9a-f]{32}$', octet_length(nonce), reserved_version_id::text from public.finalization_operations where revision_id = '${revisionId}';`);
    expect(stored).toEqual([["t", "32", r.operation!.versionId]]);
    expect(await psqlOk(`select count(*) from public.artifact_staging s join public.finalization_operations o on o.id = s.operation_id where o.document_id = '${w.documentId}';`)).toEqual([["0"]]);
    expect(await psqlOk(`select action, outcome from public.audit_events where document_id = '${w.documentId}' and action like 'finalization.%';`)).toEqual([["finalization.claimed", "ok"]]);
  });

  it("sin confirmaciones o de otro usuario no reclama ni crea operación", async () => {
    const w = await world(ana);
    const b = await frozen(ana, w.documentId);
    expect(await claim(ana, w.documentId, b.revision.revisionId)).toEqual({ status: "confirmations_missing" });
    expect(await claim(luis, w.documentId, b.revision.revisionId)).toEqual({ status: "not_available" });
    expect(await claim(ana, w.documentId, randomUUID())).toEqual({ status: "not_available" });
    expect(await operations(w.documentId)).toEqual([]);
  });

  it("exige que la revisión provenga del borrador vigente (frozen_from_draft_revision = draft_revision)", async () => {
    const w = await world(ana);
    const revisionId = await confirmed(ana, w.documentId);
    await changeDraft(w.documentId, 2);
    expect(await claim(ana, w.documentId, revisionId)).toEqual({ status: "draft_changed" });
    expect(await operations(w.documentId)).toEqual([]);
    // Una revisión nueva del borrador vigente no hereda confirmaciones: hay que confirmarla.
    const next = await frozen(ana, w.documentId, 2);
    expect(await claim(ana, w.documentId, next.revision.revisionId)).toEqual({ status: "confirmations_missing" });
    expect(await claim(ana, w.documentId, revisionId)).toEqual({ status: "revision_not_active" });
  });

  it("dos reclamos simultáneos: un ganador y la misma operación para el resto, sin fencing", async () => {
    const w = await world(ana);
    const revisionId = await confirmed(ana, w.documentId);
    const settled = await runIndependent(4, () => claim(ana, w.documentId, revisionId));
    const results = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
    expect(results.every((r) => r !== null)).toBe(true);
    expect(results.filter((r) => r!.status === "claimed")).toHaveLength(1);
    const rest = results.filter((r) => r!.status === "in_progress");
    expect(rest).toHaveLength(3);
    for (const r of rest) expect(r!.operation).not.toHaveProperty("fencing");
    expect(await operations(w.documentId)).toEqual([["reserved", "active", "1"]]);
  });

  it("lease vencido o abandono: se reanuda la misma operación con fencing nuevo", async () => {
    const w = await world(ana);
    const revisionId = await confirmed(ana, w.documentId);
    const first = await claim(ana, w.documentId, revisionId);
    await psqlOk(`update public.finalization_operations set lease_expires_at = now() - interval '1 second' where revision_id = '${revisionId}';`);
    const second = await claim(ana, w.documentId, revisionId);
    expect(second.status).toBe("resumed");
    expect(second.operation).toMatchObject({ operationId: first.operation!.operationId, versionId: first.operation!.versionId, fencing: 2 });
    await psqlOk(`update public.finalization_operations set status = 'abandoned' where revision_id = '${revisionId}';`);
    expect((await claim(ana, w.documentId, revisionId)).operation).toMatchObject({ operationId: first.operation!.operationId, status: "active", fencing: 3 });
    expect(await operations(w.documentId)).toEqual([["reserved", "active", "3"]]);
  });

  it("mientras hay claim activo la revisión no se sustituye al congelar de nuevo", async () => {
    const w = await world(ana);
    const revisionId = await confirmed(ana, w.documentId);
    await claim(ana, w.documentId, revisionId);
    await changeDraft(w.documentId, 2);
    await revisions(ana).freeze({ documentId: w.documentId, expectedDraftRevision: 2, selection: ["autor"], idempotencyKey: key("freeze") }).catch(() => undefined);
    expect(await psqlOk(`select lifecycle, (select active_revision_id::text from public.documents where id = '${w.documentId}') from public.document_revisions where id = '${revisionId}';`))
      .toEqual([["activa", revisionId]]);
    expect(await psqlOk(`select count(*) from public.document_revisions where document_id = '${w.documentId}';`)).toEqual([["1"]]);
  });
});
