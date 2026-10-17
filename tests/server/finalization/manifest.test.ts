import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createManifestService, createSupabaseManifestStore, type ManifestInputResult, type ManifestStore } from "@/lib/documents/finalization/manifest";
import { canonicalHash } from "@/lib/documents/manifest/jcs";
import { PrivateDetailSchema } from "@/lib/documents/manifest/manifest";

// Datos ficticios.
const USER = "11111111-1111-4111-8111-111111111111";
const OP = "44444444-4444-4444-8444-444444444444";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NONCE = "ab".repeat(32);
const PDF = "d".repeat(64);
const REF = "0123456789abcdef0123456789abcdef";

type Ready = Extract<ManifestInputResult, { status: "ready" }>;
const ready = (over: Partial<Ready> = {}): Ready => ({
  status: "ready", operationId: OP, phase: "pdf_staged", versionId: id(1), revisionId: id(2), snapshotId: id(3), snapshotHash: "a".repeat(64),
  publicReference: REF, nonce: NONCE, pdf: { sha256: PDF, byteLength: 100 },
  evidences: [{ evidenceId: id(20), sha256: "e".repeat(64) }, { evidenceId: id(10), sha256: "f".repeat(64) }],
  reports: [{ reportId: id(30), report: { input: { a: 1 }, output: { z: 1, b: [1, 2] }, model: "m", promptVersion: "p1", rulesVersion: "r1", limitations: [] },
    sources: [{ type: "message", id: id(41) }, { type: "evidence", id: id(40) }] }],
  confirmations: [{ responseId: id(50), role: "autor", snapshotHash: "a".repeat(64), decision: "confirmar", checkbox: true, declaredName: null, ratifiedRejection: false, respondedAt: "2026-10-17T10:00:00.000Z" }],
  previousVersion: null, staged: null, ...over,
});

/** Doble con la semántica de las RPC: un único detalle por operación, hash y manifiesto derivados de los bytes. */
function fakeStore(input = ready(), fencing = 3) {
  let saved: { bytes: Uint8Array; sha256: string } | null = null;
  const manifestHash = (detailHash: string) =>
    canonicalHash({ schemaVersion: "galcoa.manifest.v1", reference: REF, pdfHash: input.pdf.sha256, privateDetailHash: detailHash }).hash;
  const store: ManifestStore = {
    async input(i) {
      if (i.fencing !== fencing) return { status: "stale_fencing" };
      return { ...input, staged: saved && { sha256: saved.sha256, byteLength: saved.bytes.byteLength } };
    },
    async prepare(i) {
      if (i.fencing !== fencing) return { status: "stale_fencing" };
      const sha256 = createHash("sha256").update(i.detail).digest("hex");
      if (saved) return { status: saved.sha256 === sha256 ? "already_prepared" : "conflict", sha256: saved.sha256, byteLength: saved.bytes.byteLength, manifestHash: manifestHash(saved.sha256) };
      saved = { bytes: i.detail, sha256 };
      return { status: "prepared", sha256, byteLength: i.detail.byteLength, manifestHash: manifestHash(sha256) };
    },
  };
  return { store, saved: () => saved };
}

describe("MVP-082 · manifiesto privado durable", () => {
  it("arma el detalle desde lo persistido, ordenado, con el nonce reservado y un esquema estricto", async () => {
    const { store, saved } = fakeStore();
    const result = await createManifestService({ store }).prepareManifest({ operationId: OP, fencing: 3 });
    expect(result.ok).toBe(true);
    const detail = PrivateDetailSchema.parse(JSON.parse(Buffer.from(saved()!.bytes).toString("utf8")));
    expect(detail.nonce).toBe(NONCE);
    expect(detail.evidences.map((e) => e.evidenceId)).toEqual([id(10), id(20)]);
    expect(detail.reports[0].sources.map((s) => s.id)).toEqual([id(40), id(41)]);
    expect(detail.reports[0].sha256).toBe(canonicalHash(ready().reports[0].report).hash);
    if (result.ok) {
      expect(result.value.envelope).toEqual({ schemaVersion: "galcoa.manifest.v1", reference: REF, pdfHash: PDF, privateDetailHash: saved()!.sha256 });
      expect(JSON.stringify(result.value.envelope)).not.toMatch(new RegExp(`${NONCE}|${id(1)}|${id(2)}`));
    }
  });

  it("el reintento reutiliza el detalle guardado y da el mismo manifestHash sin reconstruir", async () => {
    const { store } = fakeStore();
    const service = createManifestService({ store });
    const first = await service.prepareManifest({ operationId: OP, fencing: 3 });
    const prepare = vi.spyOn(store, "prepare");
    const second = await service.prepareManifest({ operationId: OP, fencing: 3 });
    if (!first.ok || !second.ok) throw new Error();
    expect(second.value).toEqual({ ...first.value, reused: true });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("un byte distinto del PDF cambia el manifestHash y no el privateDetailHash", async () => {
    const a = await createManifestService({ store: fakeStore().store }).prepareManifest({ operationId: OP, fencing: 3 });
    const b = await createManifestService({ store: fakeStore(ready({ pdf: { sha256: "9".repeat(64), byteLength: 100 } })).store }).prepareManifest({ operationId: OP, fencing: 3 });
    if (!a.ok || !b.ok) throw new Error();
    expect(a.value.privateDetailHash).toBe(b.value.privateDetailHash);
    expect(a.value.manifestHash).not.toBe(b.value.manifestHash);
  });

  it("rechaza fencing viejo, conflicto de bytes y un manifestHash recalculado que no coincide", async () => {
    const { store } = fakeStore();
    expect(await createManifestService({ store }).prepareManifest({ operationId: OP, fencing: 2 })).toMatchObject({ ok: false, error: { code: "STALE_CLAIM", retryable: false } });
    const lying: ManifestStore = { ...store, prepare: async (i) => ({ ...(await store.prepare(i)), manifestHash: "0".repeat(64) }) as never };
    expect(await createManifestService({ store: lying }).prepareManifest({ operationId: OP, fencing: 3 })).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    const other: ManifestStore = { input: async () => ready(), prepare: async () => ({ status: "conflict", sha256: "1".repeat(64), byteLength: 5, manifestHash: "2".repeat(64) }) };
    expect(await createManifestService({ store: other }).prepareManifest({ operationId: OP, fencing: 3 })).toMatchObject({ ok: false, error: { code: "ARTIFACT_CONFLICT" } });
  });

  it("datos persistidos que no forman un detalle válido dan MANIFEST_INVALID no reintentable y no guardan nada", async () => {
    const bad = fakeStore(ready({ confirmations: [{ ...ready().confirmations[0], role: "intermediario", declaredName: null }] }));
    expect(await createManifestService({ store: bad.store }).prepareManifest({ operationId: OP, fencing: 3 })).toMatchObject({ ok: false, error: { code: "MANIFEST_INVALID", retryable: false } });
    expect(bad.saved()).toBeNull();
  });

  it("PDF ausente es reintentable; entradas inválidas se rechazan sin E/S", async () => {
    const input = vi.fn(async () => ({ status: "pdf_missing" as const }));
    const service = createManifestService({ store: { input, prepare: vi.fn() } });
    expect(await service.prepareManifest({ operationId: OP, fencing: 1 })).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    input.mockClear();
    for (const bad of [{ operationId: "x", fencing: 1 }, { operationId: OP, fencing: 0 }]) {
      expect(await service.prepareManifest(bad)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(input).not.toHaveBeenCalled();
  });
});

describe("MVP-082 · adaptador de las RPC del ejecutor", () => {
  const rpcWith = (data: unknown, error: unknown = null) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    return { calls, rpc: { rpc: async (name: string, args?: Record<string, unknown>) => { calls.push({ name, args: args ?? {} }); return { data, error }; } } };
  };

  it("liga el actor verificado y envía el detalle como Buffer", async () => {
    const { calls, rpc } = rpcWith({ status: "prepared", sha256: "c".repeat(64), byteLength: 3, manifestHash: "d".repeat(64) });
    await createSupabaseManifestStore({ verifiedUserId: USER, executor: rpc }).prepare({ operationId: OP, fencing: 2, detail: new Uint8Array([1, 2, 3]), correlationId: "corr" });
    expect(calls[0].name).toBe("prepare_finalization_manifest");
    expect(calls[0].args).toMatchObject({ p_actor_id: USER, p_operation_id: OP, p_fencing: 2, p_correlation_id: "corr" });
    expect(Buffer.isBuffer(calls[0].args.p_detail)).toBe(true);
  });

  it("no filtra errores del proveedor ni acepta formas inesperadas", async () => {
    await expect(createSupabaseManifestStore({ verifiedUserId: USER, executor: rpcWith(null, { message: "select secret" }).rpc }).input({ operationId: OP, fencing: 1 })).rejects.toThrow("Persistencia no disponible");
    await expect(createSupabaseManifestStore({ verifiedUserId: USER, executor: rpcWith({ status: "prepared", extra: 1 }).rpc }).prepare({ operationId: OP, fencing: 1, detail: new Uint8Array([1]), correlationId: "c" })).rejects.toThrow("Respuesta de persistencia inválida");
    await expect(createSupabaseManifestStore({ verifiedUserId: "", executor: rpcWith({}).rpc }).input({ operationId: OP, fencing: 1 })).rejects.toThrow("Operación no autorizada");
  });
});
