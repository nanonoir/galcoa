import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createSupabaseVersionPublishStore,
  createVersionPublishService,
  type ArtifactStorage,
  type VersionPublishStore,
} from "@/lib/documents/finalization/publish";

const OP = "44444444-4444-4444-8444-444444444444";
const VERSION = "55555555-5555-4555-8555-555555555555";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const PDF = Buffer.from("%PDF-1.7 ficticio");
const MANIFEST = Buffer.from('{"nonce":"ficticio"}');
const content = { pdf: PDF, manifest: MANIFEST };
const published = { versionId: VERSION, versionNumber: 1, manifestHash: "c".repeat(64) };

function setup() {
  const objects = new Map<string, Uint8Array>();
  const storage: ArtifactStorage = {
    upload: vi.fn(async (path, bytes) => {
      if (objects.has(path)) return "exists";
      objects.set(path, bytes);
      return "created";
    }),
    download: vi.fn(async (path) => objects.get(path) ?? null),
  };
  const store: VersionPublishStore = {
    reserve: vi.fn(async () => ({
      status: "reserved" as const,
      artifacts: (["pdf", "manifest"] as const).map((kind) => ({ kind, objectPath: `d/${kind}/x`, sha256: sha(content[kind]), byteLength: content[kind].byteLength })),
    })),
    staged: vi.fn(async ({ kind }: { kind: "pdf" | "manifest" }) => ({ status: "ready" as const, sha256: sha(content[kind]), byteLength: content[kind].byteLength, contentHex: content[kind].toString("hex") })),
    publish: vi.fn(async () => ({ status: "published" as const, ...published })),
  };
  const service = createVersionPublishService({ store, storage, newCorrelationId: () => "corr" });
  return { objects, storage, store, service };
}
const input = { operationId: OP, fencing: 2 };

describe("publicación de la versión", () => {
  it("sube los bytes del staging sin overwrite, relee y publica con las huellas verificadas", async () => {
    const { storage, store, service } = setup();
    expect(await service.publishVersion(input)).toEqual({ ok: true, value: { ...published, reused: false } });
    expect(storage.upload).toHaveBeenCalledWith("d/pdf/x", PDF, "application/pdf");
    expect(store.publish).toHaveBeenCalledWith({
      ...input, correlationId: "corr",
      pdf: { kind: "pdf", sha256: sha(PDF), byteLength: PDF.byteLength },
      manifest: { kind: "manifest", sha256: sha(MANIFEST), byteLength: MANIFEST.byteLength },
    });
  });

  it("upload ok / commit fallido: el reintento acepta el objeto existente con los mismos bytes", async () => {
    const { objects, storage, store, service } = setup();
    vi.mocked(store.publish).mockRejectedValueOnce(new Error("commit"));
    const first = await service.publishVersion(input);
    expect(first).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    expect(objects.size).toBe(2);
    expect(await service.publishVersion(input)).toMatchObject({ ok: true });
    expect(storage.upload).toHaveBeenCalledTimes(4);
    expect(objects.get("d/pdf/x")).toBe(vi.mocked(storage.upload).mock.calls[0][1]);
  });

  it("si falta el objeto reservado sube los mismos bytes del staging", async () => {
    const { objects, service } = setup();
    objects.clear();
    expect(await service.publishVersion(input)).toMatchObject({ ok: true });
    expect(Buffer.from(objects.get("d/pdf/x")!).equals(PDF)).toBe(true);
  });

  it("un objeto con bytes distintos es error técnico: nunca se pisa ni se publica", async () => {
    const { objects, storage, store, service } = setup();
    objects.set("d/pdf/x", Buffer.from("otros bytes"));
    const result = await service.publishVersion(input);
    expect(result).toMatchObject({ ok: false, error: { code: "ARTIFACT_CONFLICT", retryable: false } });
    expect(objects.get("d/pdf/x")?.toString()).toBe("otros bytes");
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(store.publish).not.toHaveBeenCalled();
  });

  it("staging que no repite lo reservado no sube nada", async () => {
    const { storage, store, service } = setup();
    vi.mocked(store.staged).mockResolvedValueOnce({ status: "ready", sha256: sha(PDF), byteLength: 3, contentHex: "010203" });
    expect(await service.publishVersion(input)).toMatchObject({ ok: false, error: { code: "ARTIFACT_CONFLICT" } });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("un fallo de Storage no publica: la versión no existe y el error es reintentable", async () => {
    const { storage, store, service } = setup();
    vi.mocked(storage.upload).mockRejectedValueOnce(new Error("storage"));
    expect(await service.publishVersion(input)).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    expect(store.publish).not.toHaveBeenCalled();
  });

  it("un worker tardío (fencing viejo) o una operación ajena no suben ni publican", async () => {
    for (const [status, code] of [["stale_fencing", "STALE_CLAIM"], ["lease_expired", "STALE_CLAIM"], ["abandoned", "FINALIZATION_ABANDONED"], ["not_available", "NOT_AVAILABLE"]] as const) {
      const { storage, store, service } = setup();
      vi.mocked(store.reserve).mockResolvedValueOnce({ status });
      expect(await service.publishVersion(input)).toMatchObject({ ok: false, error: { code } });
      expect(storage.upload).not.toHaveBeenCalled();
    }
    const late = setup();
    vi.mocked(late.store.publish).mockResolvedValueOnce({ status: "stale_fencing" });
    expect(await late.service.publishVersion(input)).toMatchObject({ ok: false, error: { code: "STALE_CLAIM" } });
  });

  it("ya publicada: devuelve la versión sin subir ni publicar otra vez", async () => {
    const { storage, store, service } = setup();
    vi.mocked(store.reserve).mockResolvedValueOnce({ status: "already_published", ...published });
    expect(await service.publishVersion(input)).toEqual({ ok: true, value: { ...published, reused: true } });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(store.publish).not.toHaveBeenCalled();
  });

  it("rechaza entradas inválidas sin llamar a la base", async () => {
    const { store, service } = setup();
    expect(await service.publishVersion({ operationId: "x", fencing: 1 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await service.publishVersion({ operationId: OP, fencing: 0 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(store.reserve).not.toHaveBeenCalled();
  });
});

describe("store de publicación", () => {
  it("liga el actor verificado y rechaza respuestas con forma inesperada", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "reserved", artifacts: [] }, error: null }));
    const store = createSupabaseVersionPublishStore({ verifiedUserId: "u", executor: { rpc } as never });
    await expect(store.reserve({ operationId: OP, fencing: 1, correlationId: "c" })).rejects.toThrow("inválida");
    expect(rpc).toHaveBeenCalledWith("reserve_finalization_objects", { p_actor_id: "u", p_operation_id: OP, p_fencing: 1, p_correlation_id: "c" });
  });
});
