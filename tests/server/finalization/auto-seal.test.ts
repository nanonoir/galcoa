import { describe, expect, it, vi } from "vitest";

import { createClaimFinalizationHandler, type FinalizationHttpDeps } from "@/lib/documents/finalization/http";
import type { ClaimResult } from "@/lib/documents/finalization/supabase";
import type { HcsClientPort, MirrorReaderPort } from "@/lib/documents/sealing/ports";
import { createSealingService } from "@/lib/documents/sealing/service";

import { memorySealingStore } from "../sealing/store";

const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const REV = "33333333-3333-4333-8333-333333333333";
const VERSION = "66666666-6666-4666-8666-666666666666";
const operation = {
  operationId: "44444444-4444-4444-8444-444444444444", revisionId: REV,
  snapshotId: "55555555-5555-4555-8555-555555555555", snapshotHash: "a".repeat(64),
  versionId: VERSION, versionNumber: 1, previousVersionId: null, renderer: "react-pdf-v1",
  phase: "reserved" as const, status: "active" as const, leaseExpiresAt: "2026-10-17T00:00:00Z",
};
const post = () => new Request("http://localhost:3000/x", { method: "POST", headers: { Origin: "http://localhost:3000" } });

function setup() {
  const memory = memorySealingStore({ versionId: VERSION, reference: "000102030405060708090a0b0c0d0e0f", manifestHash: "a".repeat(64) });
  const client: HcsClientPort = {
    prepareSubmission: vi.fn<HcsClientPort["prepareSubmission"]>(async (payload) => ({
      network: "testnet", topicId: "0.0.5005", transactionId: "0.0.1001@1792173600.000000000",
      validStart: "1792173600.000000000", payloadHash: payload.payloadHash,
      signedBytes: new Uint8Array([1, 2]), signedBytesHash: "b".repeat(64),
    })),
    submitPrepared: vi.fn<HcsClientPort["submitPrepared"]>(async () => {
      expect(memory.events).toEqual(["intent"]);
      return { outcome: "incierto", transactionId: "0.0.1001@1792173600.000000000", reason: "timeout" };
    }),
  };
  const mirror: MirrorReaderPort = {
    locateTransaction: vi.fn<MirrorReaderPort["locateTransaction"]>(async () => ({ result: "exitoso", topicId: "0.0.5005", consensusTimestamp: "1792173605.123456789", sequenceNumber: "42" })),
    checkMessage: vi.fn<MirrorReaderPort["checkMessage"]>(async () => ({ result: "coincide", topicId: "0.0.5005", sequenceNumber: "42", consensusTimestamp: "1792173605.123456789" })),
  };
  let claim: ClaimResult = { status: "claimed", operation: { ...operation, fencing: 1 } };
  const advance = vi.fn(async () => {
    claim = { status: "published", operation: { ...operation, phase: "published" } };
    return { ok: true as const, phase: "published" as const };
  });
  const sealerFor = vi.fn((userId: string) => {
    expect(userId).toBe(USER);
    expect(claim.status).toBe("published");
    // Nueva instancia por petición: la recuperación depende del store, no del proceso.
    return createSealingService({ store: memory.store, client, mirror });
  });
  const deps: FinalizationHttpDeps = {
    trustedOrigins: () => ["http://localhost:3000"],
    getContext: async () => ({ session: { status: "authenticated", user: { id: USER, email: null } }, rpc: { rpc: async () => ({ data: null, error: null }) } }),
    storeFor: () => ({ claim: async () => claim }), advancerFor: () => ({ advance }), sealerFor,
  };
  const request = () => createClaimFinalizationHandler(deps)(post(), DOC, REV);
  return { ...memory, client, mirror, advance, sealerFor, deps, request, setClaim: (value: ClaimResult) => { claim = value; } };
}

describe("publicación → sello automático durable (offline)", () => {
  it("publica, persiste intención antes de enviar; replay reconcilia sin regenerar PDF ni reenviar", async () => {
    const t = setup();
    const first = await t.request();
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ operation: { phase: "published" }, seal: { status: "pendiente" } });
    expect(t.attempts[0].outcome).toBe("incierto");
    const second = await t.request();
    const body = await second.json();
    expect(body).toMatchObject({ outcome: "published", operation: { phase: "published" }, seal: { status: "registrado" } });
    expect(JSON.stringify(body)).not.toMatch(/fencing|versionId|signedBytes|payloadHash/);
    // Solo identificadores públicos y opacos del sello (INV-06); el transactionId vive únicamente dentro de `seal`.
    expect(Object.keys(body.seal).sort()).toEqual(["consensusTimestamp", "reference", "sequenceNumber", "status", "topicId", "transactionId"]);
    expect(JSON.stringify(body.operation)).not.toContain("transactionId");
    expect(second.headers.get("Cache-Control")).toContain("no-store");
    await t.request();
    expect(t.advance).toHaveBeenCalledTimes(1);
    expect(t.client.submitPrepared).toHaveBeenCalledTimes(1);
    expect(t.client.prepareSubmission).toHaveBeenCalledTimes(1);
    expect(t.attempts).toHaveLength(1);
    expect(t.registrations).toHaveLength(1);
  });

  it("Mirror pendiente no autoriza otro envío", async () => {
    const t = setup();
    vi.mocked(t.mirror.locateTransaction).mockResolvedValue({ result: "aun_no_disponible" });
    await t.request();
    expect(await (await t.request()).json()).toMatchObject({ seal: { status: "pendiente" } });
    expect(t.client.submitPrepared).toHaveBeenCalledTimes(1);
    expect(t.advance).toHaveBeenCalledTimes(1);
  });

  it("caída tras persistir intención conserva publicación y recupera por Mirror, sin reenviar", async () => {
    const t = setup();
    vi.mocked(t.client.submitPrepared).mockRejectedValue(new Error("transport secret"));
    const first = await t.request();
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ operation: { phase: "published" }, seal: { status: "pendiente" } });
    expect(t.attempts[0].outcome).toBe("pendiente");
    expect(await (await t.request()).json()).toMatchObject({ seal: { status: "registrado" } });
    expect(t.client.submitPrepared).toHaveBeenCalledTimes(1);
  });

  it("fallos previos al envío, persistencia y configuración no convierten publicación en error", async () => {
    for (const kind of ["prepare", "intent", "factory"] as const) {
      const t = setup();
      if (kind === "prepare") vi.mocked(t.client.prepareSubmission).mockRejectedValue(new Error("secret"));
      if (kind === "intent") t.failures.intent = true;
      if (kind === "factory") t.deps.sealerFor = () => { throw new Error("secret"); };
      const response = await t.request();
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ operation: { phase: "published" }, seal: { status: "pendiente" } });
      expect(t.client.submitPrepared).not.toHaveBeenCalled();
    }
  });

  it("no inicia sello antes de publicación ni para un claim no autorizado", async () => {
    const t = setup();
    for (const claim of [
      { status: "in_progress", operation }, { status: "not_available" },
      { status: "confirmations_missing" }, { status: "rejected" },
    ] as ClaimResult[]) {
      t.setClaim(claim);
      await t.request();
    }
    expect(t.sealerFor).not.toHaveBeenCalled();
    expect(t.client.submitPrepared).not.toHaveBeenCalled();
  });
});
