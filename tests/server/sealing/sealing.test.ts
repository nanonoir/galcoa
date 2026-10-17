import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it, vi } from "vitest";

import { createSealingService } from "@/lib/documents/sealing/service";
import type { SealableVersion } from "@/lib/documents/sealing/ports";
import { createHcsClient } from "@/lib/hedera/client";
import { createMirrorReader, toMirrorTransactionId } from "@/lib/hedera/mirror";

import { hcsStatusError, hcsTimeoutError, mirrorMessageBody, scriptedHcsTransport, type HcsReceipt } from "../doubles/hedera";
import type { Step } from "../doubles/scripted";

import { memorySealingStore } from "./store";

// Todo offline: clave generada en memoria, ningún envío ni consulta real.
const ENV: Record<string, string> = {
  HEDERA_NETWORK: "testnet",
  HEDERA_OPERATOR_ID: "0.0.1001",
  HEDERA_OPERATOR_KEY: PrivateKey.generateED25519().toStringDer(),
  HEDERA_TOPIC_ID: "0.0.5005",
};
const VERSION: SealableVersion = { versionId: "v-1", reference: "000102030405060708090a0b0c0d0e0f", manifestHash: "a".repeat(64) };
const CONSENSUS = "1792173605.123456789";

type MirrorMode = "coincide" | "404" | "5xx" | "payload_distinto";

function setup(hcs: Step<HcsReceipt>[], mirrorMode: () => MirrorMode = () => "404", version: SealableVersion = VERSION, override?: typeof fetch) {
  const mem = memorySealingStore(version);
  const { transport, behavior } = scriptedHcsTransport(hcs);
  let tick = 0;
  // Un ID distinto por preparación: el tiempo de inicio avanza un segundo.
  const client = createHcsClient({ readEnv: (n) => ENV[n], transport: () => transport, now: () => new Date(1_792_173_600_000 + 1000 * tick++) });
  const mirrorFetch = vi.fn(async (input: RequestInfo | URL) => {
    const mode = mirrorMode();
    if (mode === "404") return new Response(null, { status: 404 });
    if (mode === "5xx") return new Response(null, { status: 503 });
    const sequence = String(input).split("/").pop()!;
    const last = mem.attempts.at(-1)!;
    return Response.json(
      mirrorMessageBody({
        topicId: "0.0.5005",
        sequenceNumber: sequence,
        consensusTimestamp: CONSENSUS,
        payload: mode === "payload_distinto" ? { ...VERSION, manifestHash: "b".repeat(64) } : VERSION,
        transactionId: last.transactionId,
      }),
    );
  });
  const mirror = createMirrorReader({ fetch: (override ?? mirrorFetch) as never });
  return { ...mem, behavior, mirrorFetch, service: createSealingService({ store: mem.store, client, mirror }), attempts: mem.attempts };
}

const ok = (sequenceNumber = "42"): Step<HcsReceipt> => ({ kind: "ok", value: { status: "SUCCESS", sequenceNumber } });
const timeout: Step<HcsReceipt> = { kind: "uncertain", error: hcsTimeoutError() };
const rejected: Step<HcsReceipt> = { kind: "fail", error: hcsStatusError("INVALID_TOPIC_ID") };

describe("MVP-091 · sello", () => {
  it("persiste la intención antes de enviar y asienta registrado solo con el Mirror", async () => {
    const t = setup([ok()], () => "coincide");
    const result = await t.service.seal("v-1");
    expect(result).toMatchObject({
      status: "registrado",
      registration: { sequenceNumber: "42", consensusTimestamp: CONSENSUS, topicId: "0.0.5005", network: "testnet" },
    });
    expect(t.events).toEqual(["intent", "outcome:pendiente", "registered"]);
    expect(t.behavior.calls).toHaveLength(1);
    expect(t.attempts[0].intent.payloadHash).toBe(t.attempts[0].payloadHash);
    // Los bytes firmados no pasan a la observación.
    expect(JSON.stringify(t.attempts[0].observation)).not.toContain("signed");
  });

  it("recibo sin confirmación del Mirror: pendiente, nunca registrado", async () => {
    for (const mode of ["404", "5xx"] as const) {
      const t = setup([ok()], () => mode);
      expect(await t.service.seal("v-1")).toMatchObject({
        status: "pendiente",
        reason: mode === "404" ? "esperando_mirror" : "mirror_indisponible",
      });
      expect(t.registrations).toHaveLength(0);
      expect(await t.service.status("v-1")).toEqual({ status: "pendiente" });
    }
  });

  it("sin intención persistida no se envía", async () => {
    const t = setup([ok()]);
    t.failures.intent = true;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "fallido", sent: false, code: "INTENCION_NO_PERSISTIDA" });
    expect(t.behavior.calls).toHaveLength(0);
  });

  it("versión inexistente: no disponible, sin envío", async () => {
    const t = setup([ok()]);
    expect(await t.service.seal("otra")).toEqual({ status: "no_disponible" });
    expect(t.behavior.calls).toHaveLength(0);
  });

  it("sin intentos: no_iniciado, y status no envía", async () => {
    const t = setup([ok()]);
    expect(await t.service.status("v-1")).toEqual({ status: "no_iniciado" });
    expect(t.behavior.calls).toHaveLength(0);
  });

  it("registrado es idempotente: no reenvía", async () => {
    const t = setup([ok()], () => "coincide");
    await t.service.seal("v-1");
    expect(await t.service.seal("v-1")).toMatchObject({ status: "registrado" });
    expect(t.behavior.calls).toHaveLength(1);
  });
});

describe("MVP-092 · reconciliación y reintento", () => {
  it("resultado incierto: no reenvía; sin secuencia se consulta por ID y el 404 no es ausencia", async () => {
    const t = setup([timeout, ok()]);
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "envio_incierto" });
    expect(t.attempts[0].outcome).toBe("incierto");
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "esperando_mirror" });
    expect(t.attempts[0].outcome).toBe("incierto");
    expect(t.behavior.calls).toHaveLength(1);
    expect(t.attempts).toHaveLength(1);
  });

  it("incierto con localizador y Mirror coincidente: registrado sin reenviar", async () => {
    const t = setup([timeout], () => "coincide");
    await t.service.seal("v-1");
    t.attempts[0].observation = { ...t.attempts[0].observation, sequenceNumber: "7" };
    expect(await t.service.seal("v-1")).toMatchObject({ status: "registrado", registration: { sequenceNumber: "7" } });
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("Mirror con otro contenido: discrepancia, sin registrar ni reenviar", async () => {
    const t = setup([ok()], () => "payload_distinto");
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "discrepancia_mirror" });
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "discrepancia_mirror" });
    expect(t.registrations).toHaveLength(0);
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("rechazo terminal: nuevo intento con el mismo payload y otro ID", async () => {
    const t = setup([rejected, ok()], () => "coincide");
    expect(await t.service.seal("v-1")).toMatchObject({ status: "fallido", sent: true, code: "INVALID_TOPIC_ID", retryable: true });
    expect(await t.service.status("v-1")).toEqual({ status: "fallido" });
    expect(await t.service.seal("v-1")).toMatchObject({ status: "registrado" });
    expect(t.attempts).toHaveLength(2);
    expect(t.attempts[1].payloadHash).toBe(t.attempts[0].payloadHash);
    expect(Buffer.from(t.attempts[1].intent.payload).equals(Buffer.from(t.attempts[0].intent.payload))).toBe(true);
    expect(t.attempts[1].transactionId).not.toBe(t.attempts[0].transactionId);
  });

  it("dos solicitudes simultáneas: un solo intento activo", async () => {
    const t = setup([ok()]);
    const results = await Promise.all([t.service.seal("v-1"), t.service.seal("v-1")]);
    expect(t.attempts).toHaveLength(1);
    expect(t.behavior.calls).toHaveLength(1);
    expect(results.every((r) => r.status === "pendiente")).toBe(true);
  });

  it("registro probado pero no persistido: no afirma registro", async () => {
    const t = setup([ok()], () => "coincide");
    t.failures.registration = true;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "resultado_no_persistido" });
    t.failures.registration = false;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "registrado" });
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("resultado del envío no persistido: el intento sigue pendiente, sin reenviar", async () => {
    const t = setup([ok()]);
    t.failures.outcome = true;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "resultado_no_persistido" });
    t.failures.outcome = false;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "esperando_mirror" });
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("payload inválido: fallido tipado, sin persistir ni enviar", async () => {
    const t = setup([ok()], () => "404", { ...VERSION, manifestHash: "no-es-hash" });
    expect(await t.service.seal("v-1")).toMatchObject({ status: "fallido", sent: false, code: "HCS_PAYLOAD_INVALID" });
    expect(t.attempts).toHaveLength(0);
    expect(t.behavior.calls).toHaveLength(0);
  });

  it("discrepancia: deja la observación en el intento antes de devolver pendiente", async () => {
    const t = setup([ok()], () => "payload_distinto");
    await t.service.seal("v-1");
    expect(t.attempts[0].observation).toMatchObject({ sequenceNumber: "42", reason: "discrepancia_mirror:payload" });
    expect(t.events).toContain("outcome:pendiente");
    expect(t.attempts[0].outcome).toBe("pendiente");
  });
});

describe("MVP-092 · localización por ID de transacción", () => {
  const txBody = (id: string, result: string, topic = "0.0.5005") => ({
    transactions: [{ result, name: "CONSENSUSSUBMITMESSAGE", entity_id: topic, consensus_timestamp: CONSENSUS, transaction_id: toMirrorTransactionId(id), nonce: 0 }],
  });
  function routed(route: (url: string) => Response) {
    return vi.fn(async (input: RequestInfo | URL) => route(String(input))) as unknown as typeof fetch;
  }

  it("incierto sin secuencia: el Mirror localiza topic y secuencia y se registra sin reenviar", async () => {
    let txId = "";
    const fetchDouble = routed((url) => {
      if (url.includes("/transactions/")) return Response.json(txBody(txId, "SUCCESS"));
      if (url.includes("?timestamp=eq:")) return Response.json({ messages: [{ sequence_number: 9 }] });
      return Response.json(mirrorMessageBody({ topicId: "0.0.5005", sequenceNumber: "9", consensusTimestamp: CONSENSUS, payload: VERSION, transactionId: txId }));
    });
    const t = setup([timeout], () => "404", VERSION, fetchDouble);
    await t.service.seal("v-1");
    txId = t.attempts[0].transactionId;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "registrado", registration: { sequenceNumber: "9", topicId: "0.0.5005" } });
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("fracaso terminal del ID: fallido persistido y el siguiente intento reenvía el mismo payload", async () => {
    let txId = "";
    const fetchDouble = routed((url) => {
      if (url.includes("/transactions/")) return Response.json(txBody(txId, "INVALID_TOPIC_ID"));
      return new Response(null, { status: 404 });
    });
    const t = setup([timeout, ok()], () => "404", VERSION, fetchDouble);
    await t.service.seal("v-1");
    txId = t.attempts[0].transactionId;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "fallido", sent: true, code: "INVALID_TOPIC_ID" });
    expect(t.attempts[0].outcome).toBe("fallido");
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente" });
    expect(t.attempts).toHaveLength(2);
    expect(t.attempts[1].payloadHash).toBe(t.attempts[0].payloadHash);
  });

  it("DUPLICATE_TRANSACTION: se trata como indisponible, no marca fallido ni reenvía", async () => {
    let txId = "";
    const fetchDouble = routed((url) => {
      if (url.includes("/transactions/")) return Response.json(txBody(txId, "DUPLICATE_TRANSACTION"));
      return new Response(null, { status: 404 });
    });
    const t = setup([timeout, ok()], () => "404", VERSION, fetchDouble);
    await t.service.seal("v-1");
    txId = t.attempts[0].transactionId;
    expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente", reason: "mirror_indisponible" });
    expect(t.attempts[0].outcome).toBe("incierto");
    expect(t.attempts).toHaveLength(1);
    expect(t.behavior.calls).toHaveLength(1);
  });

  it("404, 5xx o respuesta inválida del Mirror nunca cuentan como ausencia", async () => {
    for (const response of [() => new Response(null, { status: 404 }), () => new Response(null, { status: 503 }), () => Response.json({ x: 1 })]) {
      const t = setup([timeout, ok()], () => "404", VERSION, routed(response));
      await t.service.seal("v-1");
      expect(await t.service.seal("v-1")).toMatchObject({ status: "pendiente" });
      expect(t.attempts[0].outcome).toBe("incierto");
      expect(t.attempts).toHaveLength(1);
      expect(t.behavior.calls).toHaveLength(1);
    }
  });
});
