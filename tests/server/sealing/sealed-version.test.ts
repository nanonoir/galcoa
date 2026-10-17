import { describe, expect, it, vi } from "vitest";

import { readLatestSealedVersion } from "@/lib/documents/sealing/sealed-version";
import type { SealRegistration } from "@/lib/documents/sealing/ports";

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const HASH = "ab".repeat(32);
const ROW = {
  id: VERSION_ID,
  revision_id: REVISION_ID,
  version_number: 3,
  public_reference: "000102030405060708090a0b0c0d0e0f",
  manifest_hash: HASH,
  finalized_at: "2026-10-17T12:30:00+00:00",
};
const REGISTRATION: SealRegistration = {
  attemptId: "33333333-3333-4333-8333-333333333333",
  payloadHash: "cd".repeat(32),
  network: "testnet",
  topicId: "0.0.5005",
  transactionId: "0.0.99@1792173605.000000001",
  sequenceNumber: "12",
  consensusTimestamp: "1792173605.123456789",
};

/** Doble de `session.from(...)`: registra los filtros y devuelve `row` (RLS: ajeno ⇒ `null`). */
function session(row: unknown, error: unknown = null) {
  const calls: Record<string, unknown[]> = {};
  const chain = {
    select: vi.fn((columns: string) => ((calls.select = [columns]), chain)),
    eq: vi.fn((column: string, value: unknown) => ((calls.eq = [column, value]), chain)),
    order: vi.fn((column: string, options: unknown) => ((calls.order = [column, options]), chain)),
    limit: vi.fn((n: number) => ((calls.limit = [n]), chain)),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  };
  return { client: { from: vi.fn(() => chain) } as never, calls, chain };
}

describe("readLatestSealedVersion", () => {
  it("devuelve la última versión con el sello registrado y el consensusTimestamp exacto", async () => {
    const { client, calls } = session(ROW);
    const loadSealState = vi.fn(async () => ({ registration: REGISTRATION, latestAttempt: null }));
    const view = await readLatestSealedVersion({ documentId: DOC, session: client, sealing: { loadSealState } });

    expect(view).toEqual({
      documentId: DOC,
      revisionId: REVISION_ID,
      versionNumber: 3,
      reference: ROW.public_reference,
      documentHash: HASH,
      finalizedAt: "2026-10-17T12:30:00.000Z",
      seal: { status: "registrado", topicId: "0.0.5005", sequenceNumber: "12", transactionId: REGISTRATION.transactionId, consensusTimestamp: "1792173605.123456789" },
    });
    expect(loadSealState).toHaveBeenCalledWith(VERSION_ID);
    expect(calls.eq).toEqual(["document_id", DOC]);
    expect(calls.order).toEqual(["version_number", { ascending: false }]);
    expect(calls.limit).toEqual([1]);
    // INV-06: nada de bytes firmados, claves ni payload en la vista.
    expect(JSON.stringify(view)).not.toMatch(/signed|payload|attemptId/i);
  });

  it("sello pendiente mientras el último intento no terminó", async () => {
    const loadSealState = vi.fn(async () => ({
      registration: null,
      latestAttempt: { id: "a", payloadHash: HASH, transactionId: "t", outcome: "pendiente" as const, claimFencing: 1, observation: { topicId: "0.0.5005", network: "testnet" as const } },
    }));
    const view = await readLatestSealedVersion({ documentId: DOC, session: session(ROW).client, sealing: { loadSealState } });
    expect(view?.seal).toEqual({ status: "pendiente" });
  });

  it("distingue fallido y no iniciado, sin afirmar registro", async () => {
    const failed = await readLatestSealedVersion({
      documentId: DOC,
      session: session(ROW).client,
      sealing: {
        loadSealState: async () => ({
          registration: null,
          latestAttempt: { id: "a", payloadHash: HASH, transactionId: "t", outcome: "fallido", claimFencing: 1, observation: { topicId: "0.0.5005", network: "testnet" } },
        }),
      },
    });
    expect(failed?.seal).toEqual({ status: "fallido" });
    const none = await readLatestSealedVersion({
      documentId: DOC,
      session: session(ROW).client,
      sealing: { loadSealState: async () => ({ registration: null, latestAttempt: null }) },
    });
    expect(none?.seal).toEqual({ status: "no_iniciado" });
  });

  it("si el sello no se puede leer o no hay ejecutor, queda pendiente", async () => {
    const broken = await readLatestSealedVersion({
      documentId: DOC,
      session: session(ROW).client,
      sealing: { loadSealState: async () => { throw new Error("Persistencia no disponible"); } },
    });
    expect(broken?.seal).toEqual({ status: "pendiente" });
    const absent = await readLatestSealedVersion({ documentId: DOC, session: session(ROW).client, sealing: undefined });
    expect(absent?.seal).toEqual({ status: "pendiente" });
  });

  it("documento ajeno o sin versión: nada, y no consulta el sello", async () => {
    const loadSealState = vi.fn();
    expect(await readLatestSealedVersion({ documentId: DOC, session: session(null).client, sealing: { loadSealState } })).toBeNull();
    expect(loadSealState).not.toHaveBeenCalled();
  });

  it("un error de lectura de la versión se propaga como error opaco", async () => {
    await expect(readLatestSealedVersion({ documentId: DOC, session: session(null, { code: "XX000", message: "secreto" }).client, sealing: undefined })).rejects.toThrow("Persistencia no disponible");
  });
});
