import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrivateKey, Transaction } from "@hiero-ledger/sdk";
import { describe, expect, it, vi } from "vitest";

import { createHcsClient, classifySubmitError, type HcsTransport } from "@/lib/hedera/client";
import {
  HEDERA_NETWORK_ENV,
  HEDERA_OPERATOR_ID_ENV,
  HEDERA_OPERATOR_KEY_ENV,
  HEDERA_TOPIC_ID_ENV,
  HederaConfigError,
  readHederaConfig,
  TESTNET_MIRROR_ORIGIN,
} from "@/lib/hedera/config";
import { compareTimestamps, createMirrorReader } from "@/lib/hedera/mirror";
import { buildHcsPayload, HcsPayloadError, parseHcsPayload } from "@/lib/hedera/payload";

// Todo offline: clave generada en memoria, ningún envío ni consulta real.
const KEY = PrivateKey.generateED25519().toStringDer();
const ENV: Record<string, string> = {
  [HEDERA_NETWORK_ENV]: "testnet",
  [HEDERA_OPERATOR_ID_ENV]: "0.0.1001",
  [HEDERA_OPERATOR_KEY_ENV]: KEY,
  [HEDERA_TOPIC_ID_ENV]: "0.0.5005",
};
const readEnv = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

// Vector V4 de docs/design/manifest-hcs.md.
const V4 = {
  reference: "000102030405060708090a0b0c0d0e0f",
  manifestHash: "71190077727205270fbc7017d8302e7869696ec5b034a2cf54008fe373eeef0b",
  payloadHash: "b6bf58e8651e69e00cf6d3926ec1b41f0aa7c897de2812a29fbb42583064e1d1",
};

describe("MVP-090 · configuración solo Testnet", () => {
  it("acepta testnet y fija el Mirror confiable", () => {
    expect(readHederaConfig(readEnv(ENV))).toMatchObject({ network: "testnet", topicId: "0.0.5005", mirrorOrigin: TESTNET_MIRROR_ORIGIN });
  });

  it.each(["mainnet", "previewnet", "Testnet", "local"])("rechaza la red %s sin fallback", (network) => {
    expect(() => readHederaConfig(readEnv({ ...ENV, [HEDERA_NETWORK_ENV]: network }))).toThrow(
      expect.objectContaining({ code: "HEDERA_NETWORK_NOT_ALLOWED" }),
    );
  });

  it.each([
    ["sin red", { [HEDERA_NETWORK_ENV]: undefined }],
    ["sin operador", { [HEDERA_OPERATOR_ID_ENV]: undefined }],
    ["sin clave", { [HEDERA_OPERATOR_KEY_ENV]: undefined }],
    ["sin topic", { [HEDERA_TOPIC_ID_ENV]: undefined }],
    ["topic mal formado", { [HEDERA_TOPIC_ID_ENV]: "topic-1" }],
  ])("%s: error técnico sin valores", (_, over) => {
    let error: unknown;
    try {
      readHederaConfig(readEnv({ ...ENV, ...over }));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HederaConfigError);
    expect(error).toMatchObject({ code: "HEDERA_CONFIG_MISSING", stage: "hcs", retryable: false });
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe("MVP-090 · payload galcoa.hcs.v1", () => {
  it("reproduce el vector V4 del diseño: 162 bytes y su hash", () => {
    const payload = buildHcsPayload({ reference: V4.reference, manifestHash: V4.manifestHash });
    expect(payload.text).toBe(`{"manifestHash":"${V4.manifestHash}","reference":"${V4.reference}","schemaVersion":"galcoa.hcs.v1"}`);
    expect(payload.bytes.byteLength).toBe(162);
    expect(payload.payloadHash).toBe(V4.payloadHash);
  });

  it.each([
    ["referencia con mayúsculas", { reference: V4.reference.toUpperCase(), manifestHash: V4.manifestHash }],
    ["hash corto", { reference: V4.reference, manifestHash: "abc" }],
    ["datos privados en la referencia", { reference: "ana@ejemplo.invalid", manifestHash: V4.manifestHash }],
  ])("rechaza %s", (_, input) => {
    expect(() => buildHcsPayload(input)).toThrow(HcsPayloadError);
  });

  it("solo acepta de vuelta los bytes canónicos exactos", () => {
    const { bytes, text } = buildHcsPayload(V4);
    expect(parseHcsPayload(bytes)).toEqual({ reference: V4.reference, manifestHash: V4.manifestHash });
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(parseHcsPayload(enc(text.replace(",", ", ")))).toBeNull();
    expect(parseHcsPayload(enc(text.replace("}", ',"extra":"x"}')))).toBeNull();
    expect(parseHcsPayload(enc(text.replace("galcoa.hcs.v1", "galcoa.hcs.v2")))).toBeNull();
    expect(parseHcsPayload(new Uint8Array([0xff, 0xfe]))).toBeNull();
  });
});

describe("MVP-090 · cliente: preparar sin red, enviar los mismos bytes", () => {
  const payload = buildHcsPayload(V4);

  it("prepara y firma localmente un único mensaje con ID explícito", async () => {
    const client = createHcsClient({ readEnv: readEnv(ENV), now: () => new Date("2026-10-16T18:00:00Z") });
    const prepared = await client.prepareSubmission(payload);
    expect(prepared).toMatchObject({ network: "testnet", topicId: "0.0.5005", payloadHash: V4.payloadHash, validStart: "1792173600.000000000" });
    expect(prepared.transactionId).toBe("0.0.1001@1792173600.000000000");
    const tx = Transaction.fromBytes(prepared.signedBytes) as unknown as { getMessage(): Uint8Array; transactionId: { toString(): string } };
    expect(new TextDecoder().decode(tx.getMessage())).toBe(payload.text);
    expect(tx.transactionId.toString()).toBe(prepared.transactionId);
  });

  it("sin configuración no arma nada", async () => {
    await expect(createHcsClient({ readEnv: readEnv({}) }).prepareSubmission(payload)).rejects.toBeInstanceOf(HederaConfigError);
  });

  const transport = (impl: HcsTransport["execute"]) => () => ({ execute: impl });

  it("recibo SUCCESS con secuencia: «recibido», no «registrado»", async () => {
    const execute = vi.fn(async () => ({ status: "SUCCESS", sequenceNumber: "42" }));
    const client = createHcsClient({ readEnv: readEnv(ENV), transport: transport(execute) });
    const prepared = await client.prepareSubmission(payload);
    expect(await client.submitPrepared(prepared)).toEqual({
      outcome: "recibido",
      transactionId: prepared.transactionId,
      sequenceNumber: "42",
      status: "SUCCESS",
    });
    expect(execute).toHaveBeenCalledWith(prepared.signedBytes, 20_000);
  });

  it.each([
    ["timeout", Object.assign(new Error("timeout"), { name: "HcsTimeout" }), "incierto"],
    ["desconexión", new Error("ECONNRESET"), "incierto"],
    ["recibo UNKNOWN", { name: "ReceiptStatusError", status: { toString: () => "UNKNOWN" } }, "incierto"],
    ["recibo no encontrado", { name: "ReceiptStatusError", status: { toString: () => "RECEIPT_NOT_FOUND" } }, "incierto"],
    ["topic inválido en el recibo", { name: "ReceiptStatusError", status: { toString: () => "INVALID_TOPIC_ID" } }, "fallido"],
    ["saldo insuficiente en precheck", { name: "PrecheckStatusError", status: { toString: () => "INSUFFICIENT_PAYER_BALANCE" } }, "fallido"],
  ])("%s → %s", async (_, error, outcome) => {
    const client = createHcsClient({
      readEnv: readEnv(ENV),
      transport: transport(async () => {
        throw error;
      }),
    });
    const prepared = await client.prepareSubmission(payload);
    expect(await client.submitPrepared(prepared)).toMatchObject({ outcome, transactionId: prepared.transactionId });
  });

  it("un recibo ambiguo o sin secuencia nunca es éxito", async () => {
    for (const receipt of [{ status: "SUCCESS", sequenceNumber: null }, { status: "BUSY", sequenceNumber: null }]) {
      const client = createHcsClient({ readEnv: readEnv(ENV), transport: transport(async () => receipt) });
      expect((await client.submitPrepared(await client.prepareSubmission(payload))).outcome).toBe("incierto");
    }
  });

  it("bytes preparados alterados: no se envían", async () => {
    const execute = vi.fn();
    const client = createHcsClient({ readEnv: readEnv(ENV), transport: transport(execute) });
    const prepared = await client.prepareSubmission(payload);
    const tampered = { ...prepared, signedBytes: prepared.signedBytes.slice(0, -1) };
    expect(await client.submitPrepared(tampered)).toMatchObject({ outcome: "fallido", status: "LOCAL_BYTES_MISMATCH" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("clasificación por defecto: lo desconocido es incierto", () => {
    expect(classifySubmitError("t", undefined)).toMatchObject({ outcome: "incierto" });
  });
});

describe("MVP-093 · lector Mirror", () => {
  const payload = buildHcsPayload(V4);
  const expected = {
    topicId: "0.0.5005",
    sequenceNumber: "42",
    reference: V4.reference,
    manifestHash: V4.manifestHash,
    transactionId: "0.0.1001@1792173600.000000000",
  };
  const message = (over: Record<string, unknown> = {}) => ({
    topic_id: "0.0.5005",
    sequence_number: 42,
    consensus_timestamp: "1792173605.123456789",
    message: Buffer.from(payload.bytes).toString("base64"),
    chunk_info: { initial_transaction_id: { account_id: "0.0.1001", transaction_valid_start: "1792173600.000000000" } },
    ...over,
  });
  const reader = (response: () => Promise<Response>) => {
    const fetch = vi.fn(response);
    return { fetch, mirror: createMirrorReader({ fetch: fetch as never }) };
  };

  it("coincide solo con topic, secuencia, payload exacto y transacción", async () => {
    const { fetch, mirror } = reader(async () => Response.json(message()));
    expect(await mirror.checkMessage(expected)).toEqual({
      result: "coincide",
      consensusTimestamp: "1792173605.123456789",
      sequenceNumber: "42",
      topicId: "0.0.5005",
    });
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${TESTNET_MIRROR_ORIGIN}/api/v1/topics/0.0.5005/messages/42`);
  });

  it.each([
    ["otro topic", { topic_id: "0.0.6006" }, "topic"],
    ["otra secuencia", { sequence_number: 43 }, "secuencia"],
    ["otro payload", { message: Buffer.from(buildHcsPayload({ ...V4, manifestHash: "f".repeat(64) }).bytes).toString("base64") }, "payload"],
    ["base64 inválido", { message: "no es base64!" }, "payload"],
    ["otra transacción", { chunk_info: { initial_transaction_id: { account_id: "0.0.9999", transaction_valid_start: "1.000000000" } } }, "transaccion"],
  ])("%s → no_coincide", async (_, over, reason) => {
    const { mirror } = reader(async () => Response.json(message(over)));
    expect(await mirror.checkMessage(expected)).toEqual({ result: "no_coincide", reason });
  });

  it("404 o demora no prueban ausencia: «aún no disponible»", async () => {
    const { mirror } = reader(async () => new Response("{}", { status: 404 }));
    expect(await mirror.checkMessage(expected)).toEqual({ result: "aun_no_disponible" });
  });

  it.each([
    ["5xx", async () => new Response("caído", { status: 503 })],
    ["red caída", async () => Promise.reject(new TypeError("fetch failed"))],
    ["JSON inválido", async () => new Response("no-json", { status: 200 })],
    ["forma inesperada", async () => Response.json({ hola: 1 })],
    ["secuencia fuera de rango", async () => Response.json(message({ sequence_number: 2 ** 60 }))],
  ])("%s → indisponible, nunca éxito", async (_, response) => {
    const { mirror } = reader(response as () => Promise<Response>);
    expect((await mirror.checkMessage(expected)).result).toBe("indisponible");
  });

  it("consenso anterior a la época configurada: posible reinicio de red", async () => {
    const { mirror } = reader(async () => Response.json(message()));
    expect(await mirror.checkMessage({ ...expected, epochStartedAt: "1792173700.000000000" })).toEqual({ result: "posible_reinicio_de_red" });
  });

  it("localizador inválido: no consulta", async () => {
    const { fetch, mirror } = reader(async () => Response.json(message()));
    expect((await mirror.checkMessage({ ...expected, topicId: "https://atacante.invalid" })).result).toBe("indisponible");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("compara timestamps sin perder precisión", () => {
    expect(compareTimestamps("1792173605.000000001", "1792173605.000000002")).toBe(-1);
    expect(compareTimestamps("9007199254740993.5", "9007199254740992.5")).toBe(1);
    expect(compareTimestamps("1.1", "1.100000000")).toBe(0);
  });
});

describe("Aislamiento del módulo Hedera (MVP-090)", () => {
  it("cada archivo es server-only y no crea clientes ni lee el entorno al importar", () => {
    const dir = path.resolve(import.meta.dirname, "../../../src/lib/hedera");
    for (const file of readdirSync(dir)) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/);
      expect(lines[0], file).toBe('import "server-only";');
      for (const line of lines.filter((l) => /^(const|let|var|export const)\s/.test(l) && !l.includes("=>"))) {
        expect(line, file).not.toMatch(/Client\.for|process\.env|fetch\(/);
      }
    }
  });
});
