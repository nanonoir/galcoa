import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { createTestUser, psqlOk, readLocalStack, type TestUser } from "../rls/harness";

/**
 * MVP-080 · `get_finalization_status` (migración 02505) contra Postgres/PostgREST locales:
 * el propietario ve la proyección mínima; ajeno e inexistente son idénticos; no filtra secretos.
 * Datos ficticios.
 */

let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  const stack = readLocalStack();
  ana = await createTestUser(stack, "fst-a");
  luis = await createTestUser(stack, "fst-b");
});

const key = (prefix: string) => `${prefix}-${randomUUID()}`;

async function confirmedRevision(user: TestUser) {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: key("doc"), p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  await user.client.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: key("msg"), p_correlation_id: "corr-msg",
  });
  const content = JSON.stringify({ title: "Acuerdo ficticio", body: "Se entregan 12 cajas.", corrections: [] });
  await psqlOk(`insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${content}'::jsonb);`);
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: user.id, session: user.client });
  const service = createRevisionService({ session: { currentUserId: async () => user.id }, source: reader, revisions: store });
  const f = await service.freeze({ documentId, expectedDraftRevision: 1, selection: ["autor"], idempotencyKey: key("freeze") });
  if (!f.ok) throw new Error(`freeze: ${f.error.code}`);
  const { revisionId, snapshotId, snapshotHash } = f.value.revision;
  const c = await service.confirmAsAuthor({
    schemaVersion: 1, actor: "autor", documentId, revisionId, snapshotId, snapshotHash, idempotencyKey: key("author"), decision: "confirmar", checkboxChecked: true,
  });
  if (!c.ok) throw new Error(`confirm: ${c.error.code}`);
  return { documentId, revisionId };
}

const status = async (user: TestUser, documentId: string, revisionId: string) => {
  const { data, error } = await user.client.rpc("get_finalization_status", { p_document_id: documentId, p_revision_id: revisionId });
  if (error) throw new Error(error.message);
  return data as { status: string; operation?: Record<string, unknown> };
};

describe("MVP-080 · get_finalization_status sobre la base real", () => {
  it("sin operación: no_operation; tras el claim: proyección mínima sin secretos", async () => {
    const w = await confirmedRevision(ana);
    expect(await status(ana, w.documentId, w.revisionId)).toEqual({ status: "no_operation" });
    const claimed = await ana.client.rpc("claim_finalization", {
      p_document_id: w.documentId, p_revision_id: w.revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 60, p_correlation_id: "corr-claim",
    });
    expect(claimed.data.status).toBe("claimed");
    const r = await status(ana, w.documentId, w.revisionId);
    expect(r).toEqual({ status: "found", operation: { operationId: claimed.data.operation.operationId, phase: "reserved", status: "active", versionNumber: 1 } });
    expect(JSON.stringify(r)).not.toMatch(/nonce|fencing|hash|versionId|renderer/i);
  });

  it("ajeno, revisión de otro documento e inexistente devuelven exactamente lo mismo", async () => {
    const w = await confirmedRevision(ana);
    const other = await confirmedRevision(ana);
    const expected = { status: "not_available" };
    expect(await status(luis, w.documentId, w.revisionId)).toEqual(expected);
    expect(await status(ana, w.documentId, randomUUID())).toEqual(expected);
    expect(await status(ana, randomUUID(), w.revisionId)).toEqual(expected);
    expect(await status(ana, w.documentId, other.revisionId)).toEqual(expected);
  });
});
