import { describe, expect, it, vi } from "vitest";

import { readVersionHistory } from "@/lib/documents/sealing/version-history";

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "44444444-4444-4444-8444-444444444444";
const row = (id: string, n: number, previous: string | null) => ({
  id,
  revision_id: "22222222-2222-4222-8222-222222222222",
  snapshot_id: "33333333-3333-4333-8333-333333333333",
  version_number: n,
  previous_version_id: previous,
  finalized_at: "2026-10-17T12:30:00+00:00",
});

/** Doble de `session.from(...).select().eq().order()`; RLS: ajeno ⇒ `data: []`. */
function session(data: unknown, error: unknown = null) {
  const order = vi.fn(async () => ({ data, error }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn((columns: string) => (void columns, { eq }));
  return { client: { from: vi.fn(() => ({ select })) } as never, select, eq, order };
}

describe("readVersionHistory", () => {
  it("mapea las versiones reales y deriva el sello de cada una", async () => {
    const { client, eq, order, select } = session([row(V2, 2, V1), row(V1, 1, null)]);
    const loadSealState = vi.fn(async (id: string) =>
      id === V1
        ? { registration: { attemptId: "a", payloadHash: "b", network: "testnet" as const, topicId: "0.0.1", transactionId: "t", sequenceNumber: "1", consensusTimestamp: "1.1" }, latestAttempt: null }
        : { registration: null, latestAttempt: null },
    );
    const state = await readVersionHistory({ documentId: DOC, session: client, sealing: { loadSealState } });

    expect(state).toEqual({
      status: "ready",
      versions: [
        { versionId: V2, number: 2, previousVersionId: V1, revisionId: row(V2, 2, V1).revision_id, snapshotId: row(V2, 2, V1).snapshot_id, finalizedAt: "2026-10-17T12:30:00.000Z", hcsStatus: "no_iniciado" },
        { versionId: V1, number: 1, previousVersionId: null, revisionId: row(V1, 1, null).revision_id, snapshotId: row(V1, 1, null).snapshot_id, finalizedAt: "2026-10-17T12:30:00.000Z", hcsStatus: "registrado" },
      ],
    });
    expect(eq).toHaveBeenCalledWith("document_id", DOC);
    expect(order).toHaveBeenCalledWith("version_number", { ascending: false });
    // Allowlist: no se piden hashes, referencias públicas ni envelope.
    expect(select.mock.calls[0]![0]).not.toMatch(/hash|reference|envelope/);
  });

  it("documento ajeno o sin versiones: ready vacío", async () => {
    expect(await readVersionHistory({ documentId: DOC, session: session([]).client, sealing: undefined })).toEqual({ status: "ready", versions: [] });
  });

  it("error de lectura o fila inválida: estado error, nunca una lista vacía", async () => {
    const failed = await readVersionHistory({ documentId: DOC, session: session(null, { message: "secreto" }).client, sealing: undefined });
    expect(failed.status).toBe("error");
    expect(JSON.stringify(failed)).not.toContain("secreto");
    expect((await readVersionHistory({ documentId: DOC, session: session([{ id: "x" }]).client, sealing: undefined })).status).toBe("error");
  });

  it("sin lectura del sello queda pendiente, sin afirmar registro", async () => {
    const loadSealState = async () => {
      throw new Error("caído");
    };
    const state = await readVersionHistory({ documentId: DOC, session: session([row(V1, 1, null)]).client, sealing: { loadSealState } });
    expect(state).toMatchObject({ status: "ready", versions: [{ hcsStatus: "pendiente" }] });
    const absent = await readVersionHistory({ documentId: DOC, session: session([row(V1, 1, null)]).client, sealing: undefined });
    expect(absent).toMatchObject({ versions: [{ hcsStatus: "pendiente" }] });
  });
});
