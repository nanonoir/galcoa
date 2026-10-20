import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createManifestService, createSupabaseManifestStore } from "@/lib/documents/finalization/manifest";
import { createPdfStagingService, createSupabasePdfStagingStore } from "@/lib/documents/finalization/staging";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { buyerConfirms, localAlc } from "./alc-support";

import { createTestUser, psql, psqlAs, psqlOk, readLocalStack, type LocalStack, type TestUser } from "../rls/harness";

import { runIndependent } from "./concurrency";

/**
 * MVP-082 · manifiesto privado durable (migración 02509) contra Postgres local real: entrada del detalle desde
 * lo persistido, INSERT único bajo fencing, idempotencia, conflicto, identidades y nonce reservados, y acceso
 * solo del ejecutor. Sin Storage, versión publicada ni Hedera. Datos ficticios.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

let stack: LocalStack;
let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  stack = readLocalStack();
  ana = await createTestUser(stack, "mf-a");
  luis = await createTestUser(stack, "mf-b");
});

const key = (prefix: string) => `${prefix}-${randomUUID()}`;
const lit = (v: unknown) => (v === null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const hex = (bytes: Uint8Array) => `decode('${Buffer.from(bytes).toString("hex")}', 'hex')`;
const count = async (sql: string) => Number((await psqlOk(`select count(*) from ${sql};`))[0][0]);

async function asExecutor(call: string): Promise<R> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}
const manifestInput = (actor: TestUser, operationId: string, fencing: number) =>
  asExecutor(`public.get_finalization_manifest_input(${lit(actor.id)}, ${lit(operationId)}, ${fencing})`);
const prepare = (actor: TestUser, operationId: string, fencing: number, detail: Uint8Array) =>
  asExecutor(`public.prepare_finalization_manifest(${lit(actor.id)}, ${lit(operationId)}, ${fencing}, ${hex(detail)}, 'corr-manifest')`);

/** `DocumentRpc` sobre la conexión del ejecutor: mismas RPC que el adaptador de producción. */
function executorRpc() {
  return {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const params = Object.entries(args).map(([k, v]) => `${k} => ${Buffer.isBuffer(v) ? hex(v) : lit(v as string | number)}`);
      try {
        return { data: await asExecutor(`public.${name}(${params.join(", ")})`), error: null };
      } catch {
        return { data: null, error: { code: "EXECUTOR_UNAVAILABLE" } };
      }
    },
  };
}

/** Documento con una revisión solo-autor confirmada, reclamada y con el PDF canónico en staging. */
async function staged(user: TestUser) {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: key("doc"), p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  await user.client.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: key("msg"), p_correlation_id: "corr-msg",
  });
  const content = JSON.stringify({ title: "Acuerdo ficticio", body: "Se entregan 12 cajas.", corrections: [] });
  await psqlOk(`insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${content}'::jsonb);`);
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: user.id, session: user.client });
  const service = createRevisionService({ session: { currentUserId: async () => user.id }, source: reader, revisions: store, alc: localAlc(user.id) });
  const f = await service.freeze({ documentId, expectedDraftRevision: 1, selection: ["autor", "comprador"], idempotencyKey: key("freeze") });
  if (!f.ok) throw new Error(`freeze: ${f.error.code}`);
  const { revisionId, snapshotId, snapshotHash } = f.value.revision;
  const c = await service.confirmAsAuthor({
    schemaVersion: 1, actor: "autor", documentId, revisionId, snapshotId, snapshotHash, idempotencyKey: key("author"), decision: "confirmar", checkboxChecked: true,
  });
  if (!c.ok) throw new Error(`confirm: ${c.error.code}`);
  await buyerConfirms(user, stack, f.value.revision);
  const claim = await user.client.rpc("claim_finalization", {
    p_document_id: documentId, p_revision_id: revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 60, p_correlation_id: "corr-claim",
  });
  if (claim.error) throw new Error(claim.error.message);
  const op = claim.data.operation as { operationId: string; fencing: number };
  const stagedPdf = await createPdfStagingService({ store: createSupabasePdfStagingStore({ verifiedUserId: user.id, executor: executorRpc() }) })
    .stagePdf({ operationId: op.operationId, fencing: op.fencing });
  if (!stagedPdf.ok) throw new Error(`stage: ${stagedPdf.error.code}`);
  return { documentId, revisionId, snapshotId, snapshotHash, operationId: op.operationId, fencing: op.fencing };
}

const row = async (operationId: string) =>
  (await psqlOk(`select phase, (select count(*) from public.artifact_staging s where s.operation_id = o.id and s.kind = 'manifest') from public.finalization_operations o where id = '${operationId}';`))[0];
const service = (user: TestUser) => createManifestService({ store: createSupabaseManifestStore({ verifiedUserId: user.id, executor: executorRpc() }) });

describe("MVP-082 · entrada del manifiesto desde lo persistido", () => {
  it("devuelve identidades y nonce reservados, PDF en staging y constancias del mismo snapshot; ajeno o fencing viejo no ven nada", async () => {
    const w = await staged(ana);
    const input = await manifestInput(ana, w.operationId, w.fencing);
    expect(input).toMatchObject({
      status: "ready", operationId: w.operationId, phase: "pdf_staged", revisionId: w.revisionId, snapshotId: w.snapshotId,
      snapshotHash: w.snapshotHash, evidences: [], reports: [], previousVersion: null, staged: null,
    });
    expect(input.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(input.pdf.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(input.confirmations).toHaveLength(2);
    expect(input.confirmations[0]).toMatchObject({ role: "autor", decision: "confirmar", checkbox: true, ratifiedRejection: false });
    expect(input.confirmations[1]).toMatchObject({ role: "comprador", decision: "confirmar", checkbox: true, ratifiedRejection: false });
    expect(input.confirmations[0].respondedAt).toMatch(/\.\d{3}Z$/);
    expect(await manifestInput(ana, w.operationId, w.fencing + 1)).toEqual({ status: "stale_fencing" });
    expect(await manifestInput(luis, w.operationId, w.fencing)).toEqual({ status: "not_available" });
  });

  it("incluye el reporte citado por el snapshot con sus fuentes y la evidencia que lo sustenta", async () => {
    const w = await staged(ana);
    const reportId = randomUUID();
    const evidenceId = randomUUID();
    await psqlOk(`insert into public.verification_reports(id, document_id, input, output, model, prompt_version, rules_version)
      values ('${reportId}', '${w.documentId}', '{"a":1}'::jsonb, '{"ok":true}'::jsonb, 'modelo-ficticio', 'p1', 'r1');`);
    await psqlOk(`insert into public.evidences(id, document_id, kind, mime_type, byte_length, sha256, private_location, upload_state, accepted_at)
      values ('${evidenceId}', '${w.documentId}', 'texto', 'text/plain', 3, '${"e".repeat(64)}', 'doc/${evidenceId}', 'accepted', now());`);
    await psqlOk(`insert into public.report_sources(document_id, report_id, evidence_id) values ('${w.documentId}', '${reportId}', '${evidenceId}');`);
    await psqlOk(`insert into public.snapshot_sources(document_id, snapshot_id, revision_id, snapshot_hash, alias, report_id)
      values ('${w.documentId}', '${w.snapshotId}', '${w.revisionId}', '${w.snapshotHash}', 'rep-1', '${reportId}');`);
    const input = await manifestInput(ana, w.operationId, w.fencing);
    expect(input.evidences).toEqual([{ evidenceId, sha256: "e".repeat(64) }]);
    expect(input.reports).toHaveLength(1);
    expect(input.reports[0]).toMatchObject({ reportId, report: { model: "modelo-ficticio", promptVersion: "p1", rulesVersion: "r1" }, sources: [{ type: "evidence", id: evidenceId }] });
  });
});

describe("MVP-082 · prepare_finalization_manifest sobre la base real", () => {
  it("el servicio guarda el detalle una vez, deriva el hash en SQL, avanza a manifest_ready y el manifestHash coincide", async () => {
    const w = await staged(ana);
    const first = await service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing });
    expect(first).toMatchObject({ ok: true, value: { reused: false } });
    if (!first.ok) throw new Error();
    const [sha, len, kind] = (await psqlOk(`select sha256, byte_length, kind from public.artifact_staging where operation_id = '${w.operationId}' and kind = 'manifest';`))[0];
    expect([sha, kind]).toEqual([first.value.privateDetailHash, "manifest"]);
    expect(Number(len)).toBeGreaterThan(0);
    expect(await row(w.operationId)).toEqual(["manifest_ready", "1"]);
    expect(await count(`public.audit_events where document_id = '${w.documentId}' and action = 'finalization.manifest_ready'`)).toBe(1);
    // Sin publicación: ninguna versión ni artefacto.
    expect(await count(`public.document_versions where document_id = '${w.documentId}'`)).toBe(0);

    const second = await service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing });
    expect(second).toMatchObject({ ok: true, value: { reused: true, manifestHash: first.value.manifestHash, privateDetailHash: first.value.privateDetailHash } });
    expect(await count(`public.audit_events where document_id = '${w.documentId}' and action = 'finalization.manifest_ready'`)).toBe(1);
  });

  it("bytes distintos son conflicto sin sobrescribir; un detalle que no repite la reserva se rechaza", async () => {
    const w = await staged(ana);
    const bogus = await prepare(ana, w.operationId, w.fencing, new TextEncoder().encode('{"schemaVersion":"galcoa.private-detail.v1"}')).catch((e: Error) => e);
    expect(bogus).toBeInstanceOf(Error);
    expect(await row(w.operationId)).toEqual(["pdf_staged", "0"]);

    const ok = await service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing });
    if (!ok.ok) throw new Error();
    const other = await prepare(ana, w.operationId, w.fencing, new TextEncoder().encode("{}"));
    expect(other).toMatchObject({ status: "conflict", sha256: ok.value.privateDetailHash });
    expect(await row(w.operationId)).toEqual(["manifest_ready", "1"]);
  });

  it("un fencing viejo no escribe; tras la toma el nuevo reutiliza el detalle; abandonada y lease vencido no escriben", async () => {
    const w = await staged(ana);
    await psqlOk(`update public.finalization_operations set lease_expires_at = now() - interval '1 minute' where id = '${w.operationId}';`);
    expect(await service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing })).toMatchObject({ ok: false, error: { code: "STALE_CLAIM" } });
    expect(await row(w.operationId)).toEqual(["pdf_staged", "0"]);
    const resumed = await ana.client.rpc("claim_finalization", {
      p_document_id: w.documentId, p_revision_id: w.revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 60, p_correlation_id: "corr-resume",
    });
    const newFencing = resumed.data.operation.fencing as number;
    expect(newFencing).toBe(w.fencing + 1);
    expect(await service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing })).toMatchObject({ ok: false, error: { code: "STALE_CLAIM" } });
    expect(await service(ana).prepareManifest({ operationId: w.operationId, fencing: newFencing })).toMatchObject({ ok: true, value: { reused: false } });

    const v = await staged(ana);
    await psqlOk(`update public.finalization_operations set status = 'abandoned' where id = '${v.operationId}';`);
    expect(await service(ana).prepareManifest({ operationId: v.operationId, fencing: v.fencing })).toMatchObject({ ok: false, error: { code: "FINALIZATION_ABANDONED" } });
    expect(await row(v.operationId)).toEqual(["pdf_staged", "0"]);
  });

  it("cuatro intentos concurrentes: uno guarda y el resto reutiliza el mismo detalle", async () => {
    const w = await staged(ana);
    const settled = await runIndependent(4, () => service(ana).prepareManifest({ operationId: w.operationId, fencing: w.fencing }));
    const results = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
    expect(results.every((r) => r?.ok)).toBe(true);
    expect(new Set(results.map((r) => (r?.ok ? r.value.manifestHash : ""))).size).toBe(1);
    expect(results.filter((r) => r?.ok && !r.value.reused)).toHaveLength(1);
    expect(await row(w.operationId)).toEqual(["manifest_ready", "1"]);
  });

  it("no la ejecutan anon, authenticated ni service_role y un usuario ajeno no ve la operación", async () => {
    const w = await staged(ana);
    const detail = new TextEncoder().encode("{}");
    for (const kind of ["anon", "service_role"] as const) {
      const denied = await psqlAs({ kind }, `select public.prepare_finalization_manifest(${lit(ana.id)}, ${lit(w.operationId)}, ${w.fencing}, ${hex(detail)}, 'c');`);
      expect(denied.ok).toBe(false);
    }
    const asOwner = await psqlAs({ kind: "authenticated", userId: ana.id }, `select public.get_finalization_manifest_input(${lit(ana.id)}, ${lit(w.operationId)}, ${w.fencing});`);
    expect(asOwner.ok).toBe(false);
    expect(await prepare(luis, w.operationId, w.fencing, detail)).toEqual({ status: "not_available" });
    expect(await row(w.operationId)).toEqual(["pdf_staged", "0"]);
  });
});
