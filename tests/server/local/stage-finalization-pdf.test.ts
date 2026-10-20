import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createPdfStagingService, createSupabasePdfStagingStore } from "@/lib/documents/finalization/staging";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { buyerConfirms, localAlc } from "./alc-support";

import { createTestUser, psql, psqlAs, psqlOk, readLocalStack, type LocalStack, type TestUser } from "../rls/harness";

import { runIndependent } from "./concurrency";

/**
 * MVP-081 · staging canónico del PDF (migración 02506) contra Postgres local real: entrada de render desde el
 * snapshot persistido, INSERT único bajo fencing, idempotencia, conflicto de bytes, lease y acceso solo del
 * ejecutor. El servicio corre con el renderer real y las RPC por una conexión `galcoa_executor`. Sin Storage,
 * versión publicada ni Hedera. Datos ficticios.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

let stack: LocalStack;
let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  stack = readLocalStack();
  ana = await createTestUser(stack, "stg-a");
  luis = await createTestUser(stack, "stg-b");
});

const key = (prefix: string) => `${prefix}-${randomUUID()}`;
const lit = (v: unknown) => (v === null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const hex = (bytes: Uint8Array) => `decode('${Buffer.from(bytes).toString("hex")}', 'hex')`;
const count = async (sql: string) => Number((await psqlOk(`select count(*) from ${sql};`))[0][0]);

/** Llamada como `galcoa_executor` (conexión propia por llamada). */
async function asExecutor(call: string): Promise<R> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}
const renderInput = (actor: TestUser, operationId: string, fencing: number) =>
  asExecutor(`public.get_finalization_render_input(${lit(actor.id)}, ${lit(operationId)}, ${fencing})`);
const stage = (actor: TestUser, operationId: string, fencing: number, bytes: Uint8Array) =>
  asExecutor(`public.stage_finalization_pdf(${lit(actor.id)}, ${lit(operationId)}, ${fencing}, ${hex(bytes)}, 'corr-stage')`);

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

/** Documento con una revisión solo-autor confirmada y reclamada. */
async function claimed(user: TestUser) {
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
  return { documentId, revisionId, operationId: op.operationId, fencing: op.fencing };
}

const row = async (operationId: string) =>
  (await psqlOk(`select phase, (select count(*) from public.artifact_staging s where s.operation_id = o.id) from public.finalization_operations o where id = '${operationId}';`))[0];

describe("MVP-081 · entrada de render desde el snapshot persistido", () => {
  it("devuelve snapshot y constancias del mismo snapshot, solo con el fencing vigente y para el propietario", async () => {
    const w = await claimed(ana);
    const input = await renderInput(ana, w.operationId, w.fencing);
    expect(input).toMatchObject({
      status: "ready", operationId: w.operationId, revisionId: w.revisionId, phase: "reserved", staged: null,
      content: { operation: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas." }, selection: ["autor", "comprador"] },
    });
    expect(input.receipts).toHaveLength(2);
    expect(input.receipts[0]).toMatchObject({ role: "autor", decision: "confirmar", declaredName: null });
    expect(input.receipts[1]).toMatchObject({ role: "comprador", decision: "confirmar", declaredName: "Juan Pérez" });
    expect(await renderInput(ana, w.operationId, w.fencing + 1)).toEqual({ status: "stale_fencing" });
    expect(await renderInput(luis, w.operationId, w.fencing)).toEqual({ status: "not_available" });
    expect(await renderInput(ana, randomUUID(), 1)).toEqual({ status: "not_available" });
  });
});

describe("MVP-081 · stage_finalization_pdf sobre la base real", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7 bytes ficticios");

  it("guarda una vez, deriva hash y longitud de los bytes y avanza a pdf_staged", async () => {
    const w = await claimed(ana);
    const r = await stage(ana, w.operationId, w.fencing, PDF);
    expect(r.status).toBe("staged");
    expect(r.byteLength).toBe(PDF.byteLength);
    const [sha, len] = (await psqlOk(`select sha256, byte_length from public.artifact_staging where operation_id = '${w.operationId}';`))[0];
    expect([sha, Number(len)]).toEqual([r.sha256, PDF.byteLength]);
    expect(await row(w.operationId)).toEqual(["pdf_staged", "1"]);
    expect(await count(`public.audit_events where document_id = '${w.documentId}' and action = 'finalization.pdf_staged'`)).toBe(1);
    // No se publica nada: sin versión ni artefactos publicados.
    expect(await count(`public.document_versions where document_id = '${w.documentId}'`)).toBe(0);
    expect(await count(`public.version_artifacts va join public.document_versions v on v.id = va.version_id where v.document_id = '${w.documentId}'`)).toBe(0);
  });

  it("el reintento con el mismo fencing es idempotente; bytes distintos son conflicto sin sobrescribir", async () => {
    const w = await claimed(ana);
    const first = await stage(ana, w.operationId, w.fencing, PDF);
    expect(await stage(ana, w.operationId, w.fencing, PDF)).toEqual({ ...first, status: "already_staged" });
    const other = await stage(ana, w.operationId, w.fencing, new TextEncoder().encode("%PDF-1.7 otros"));
    expect(other).toEqual({ ...first, status: "conflict" });
    expect(await row(w.operationId)).toEqual(["pdf_staged", "1"]);
    expect((await renderInput(ana, w.operationId, w.fencing)).staged).toEqual({ sha256: first.sha256, byteLength: first.byteLength });
    expect(await count(`public.audit_events where document_id = '${w.documentId}' and action = 'finalization.pdf_staged'`)).toBe(1);
  });

  it("un fencing viejo no escribe; tras la toma, el nuevo reutiliza los bytes ya guardados", async () => {
    const w = await claimed(ana);
    await psqlOk(`update public.finalization_operations set lease_expires_at = now() - interval '1 minute' where id = '${w.operationId}';`);
    const resumed = await ana.client.rpc("claim_finalization", {
      p_document_id: w.documentId, p_revision_id: w.revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 60, p_correlation_id: "corr-resume",
    });
    const newFencing = resumed.data.operation.fencing as number;
    expect(newFencing).toBe(w.fencing + 1);
    expect(await stage(ana, w.operationId, w.fencing, PDF)).toEqual({ status: "stale_fencing" });
    expect(await row(w.operationId)).toEqual(["reserved", "0"]);
    const ok = await stage(ana, w.operationId, newFencing, PDF);
    expect(ok.status).toBe("staged");
    expect(await stage(ana, w.operationId, w.fencing, PDF)).toEqual({ status: "stale_fencing" });
  });

  it("con el lease vencido sin bytes guardados no escribe; la operación abandonada tampoco", async () => {
    const w = await claimed(ana);
    await psqlOk(`update public.finalization_operations set lease_expires_at = now() - interval '1 minute' where id = '${w.operationId}';`);
    expect(await stage(ana, w.operationId, w.fencing, PDF)).toEqual({ status: "lease_expired" });
    expect(await row(w.operationId)).toEqual(["reserved", "0"]);
    await psqlOk(`update public.finalization_operations set status = 'abandoned' where id = '${w.operationId}';`);
    expect(await stage(ana, w.operationId, w.fencing, PDF)).toEqual({ status: "abandoned" });
    expect((await renderInput(ana, w.operationId, w.fencing)).status).toBe("abandoned");
  });

  it("un usuario ajeno o una operación inexistente son indistinguibles", async () => {
    const w = await claimed(ana);
    expect(await stage(luis, w.operationId, w.fencing, PDF)).toEqual({ status: "not_available" });
    expect(await stage(ana, randomUUID(), 1, PDF)).toEqual({ status: "not_available" });
    expect(await row(w.operationId)).toEqual(["reserved", "0"]);
  });

  it("cuatro intentos concurrentes con los mismos bytes: uno guarda y el resto reutiliza", async () => {
    const w = await claimed(ana);
    const settled = await runIndependent(4, () => stage(ana, w.operationId, w.fencing, PDF));
    const statuses = settled.map((s) => (s.status === "fulfilled" ? s.value.status : "rejected")).sort();
    expect(statuses).toEqual(["already_staged", "already_staged", "already_staged", "staged"]);
    expect(await row(w.operationId)).toEqual(["pdf_staged", "1"]);
  });

  it("rechaza parámetros inválidos y no la ejecutan anon, authenticated ni service_role", async () => {
    const w = await claimed(ana);
    const empty = await psql(`set role galcoa_executor;\nselect public.stage_finalization_pdf(${lit(ana.id)}, ${lit(w.operationId)}, ${w.fencing}, ''::bytea, 'c');`, "supabase_admin");
    expect(empty.ok).toBe(false);
    for (const kind of ["anon", "service_role"] as const) {
      const denied = await psqlAs({ kind }, `select public.stage_finalization_pdf(${lit(ana.id)}, ${lit(w.operationId)}, ${w.fencing}, ${hex(PDF)}, 'c');`);
      expect(denied.ok).toBe(false);
    }
    const asOwner = await psqlAs({ kind: "authenticated", userId: ana.id }, `select public.stage_finalization_pdf(${lit(ana.id)}, ${lit(w.operationId)}, ${w.fencing}, ${hex(PDF)}, 'c');`);
    expect(asOwner.ok).toBe(false);
    expect(await row(w.operationId)).toEqual(["reserved", "0"]);
  });
});

describe("MVP-081 · servicio completo con el renderer real", () => {
  it("renderiza desde el snapshot, guarda y reutiliza sin volver a renderizar", async () => {
    const w = await claimed(ana);
    const service = createPdfStagingService({ store: createSupabasePdfStagingStore({ verifiedUserId: ana.id, executor: executorRpc() }) });
    const first = await service.stagePdf({ operationId: w.operationId, fencing: w.fencing });
    expect(first).toMatchObject({ ok: true, value: { reused: false } });
    const second = await service.stagePdf({ operationId: w.operationId, fencing: w.fencing });
    expect(second).toMatchObject({ ok: true, value: { reused: true } });
    if (!first.ok || !second.ok) throw new Error();
    expect(second.value.sha256).toBe(first.value.sha256);
    const stored = (await psqlOk(`select sha256, byte_length, left(encode(content, 'escape'), 5) from public.artifact_staging where operation_id = '${w.operationId}';`))[0];
    expect([stored[0], Number(stored[1]), stored[2]]).toEqual([first.value.sha256, first.value.byteLength, "%PDF-"]);
    expect(await row(w.operationId)).toEqual(["pdf_staged", "1"]);
    const stale = await service.stagePdf({ operationId: w.operationId, fencing: w.fencing + 1 });
    expect(stale).toMatchObject({ ok: false, error: { code: "STALE_CLAIM" } });
  });
});
