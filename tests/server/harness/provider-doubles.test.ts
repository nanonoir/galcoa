import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { GROQ_API_KEY_ENV } from "@/lib/ai/groq/config";
import { createGroqStructuredPort } from "@/lib/ai/groq/structured";
import { createHcsClient } from "@/lib/hedera/client";
import { TESTNET_MIRROR_ORIGIN } from "@/lib/hedera/config";
import { createMirrorReader } from "@/lib/hedera/mirror";

import { scriptedGroqClient, truncatedGroqClient } from "../doubles/groq";
import {
  fakePreparedSubmission,
  hcsStatusError,
  hcsTimeoutError,
  mirrorMessageBody,
  scriptedHcsTransport,
  scriptedMirrorFetch,
} from "../doubles/hedera";
import { createInMemoryEvidenceStorage } from "../doubles/storage";
import { createTestClock } from "../support/clock";
import { blockNetwork } from "../support/network-guard";

let restore: (() => void) | null = null;
afterEach(() => restore?.());

const schema = z.strictObject({ resultado: z.enum(["coincide", "no_coincide", "no_verificable"]) });
const groqInput = { instructions: "contrasta", sources: [{ id: "msg-1", text: "40 cajas" }], schema, schemaName: "contraste" };
const readEnv = (name: string) => (name === GROQ_API_KEY_ENV ? "clave-ficticia" : undefined);

describe("Groq guionado contra el puerto real", () => {
  it("éxito, salida inválida, fallo y respuesta incompleta, sin tocar la red", async () => {
    const net = blockNetwork();
    restore = net.restore;
    const { client, behavior } = scriptedGroqClient([
      { kind: "ok", value: { resultado: "coincide" } },
      { kind: "invalid", value: { resultado: "otro" } },
      { kind: "fail", error: new Error("caído") },
    ]);
    const port = createGroqStructuredPort({ readEnv, createClient: () => client, log: () => {} });

    expect(await port.generateStructured(groqInput)).toMatchObject({ ok: true, output: { resultado: "coincide" } });
    expect(await port.generateStructured(groqInput)).toMatchObject({ ok: false, error: { code: "AI_INVALID_OUTPUT", retryable: true } });
    expect(await port.generateStructured(groqInput)).toMatchObject({ ok: false, error: { code: "AI_PROVIDER_ERROR" } });
    expect(behavior.calls).toHaveLength(3);

    const truncated = createGroqStructuredPort({ readEnv, createClient: () => truncatedGroqClient(), log: () => {} });
    expect(await truncated.generateStructured(groqInput)).toMatchObject({ ok: false, error: { code: "AI_INCOMPLETE_OUTPUT" } });
    expect(net.attempts).toEqual([]);
  });

  it("la cancelación del llamador llega al doble", async () => {
    const { client } = scriptedGroqClient([{ kind: "hang" }]);
    const port = createGroqStructuredPort({ readEnv, createClient: () => client, log: () => {} });
    const controller = new AbortController();
    const pending = port.generateStructured({ ...groqInput, abortSignal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "AI_ABORTED" } });
  });
});

describe("Storage en memoria contra el puerto real", () => {
  const location = "documents/d1/evidence/e1";

  it("subida pendiente, objeto presente, lectura y borrado", async () => {
    const storage = createInMemoryEvidenceStorage(createTestClock());
    const upload = await storage.createSignedUpload(location, { contentType: "application/pdf", maxBytes: 10, expiresInSeconds: 60 });
    expect(upload.expiresAt).toBe("2026-01-15T12:01:00.000Z");
    expect(await storage.download(location)).toBeNull();

    storage.put(location, new Uint8Array([1, 2, 3]));
    expect(await storage.download(location)).toEqual(new Uint8Array([1, 2, 3]));
    expect(storage.has(location)).toBe(true);
    await storage.remove(location);
    expect(await storage.download(location)).toBeNull();
  });

  it("failNext falla solo la siguiente llamada de esa operación", async () => {
    const storage = createInMemoryEvidenceStorage();
    storage.failNext("download", new Error("storage caído"));
    await expect(storage.download(location)).rejects.toThrow("storage caído");
    await expect(storage.download(location)).resolves.toBeNull();
    expect(storage.calls.map((c) => c.operation)).toEqual(["download", "download"]);
  });
});

describe("HCS guionado contra el cliente real", () => {
  const hederaEnv = (name: string) =>
    ({ HEDERA_NETWORK: "testnet", HEDERA_OPERATOR_ID: "0.0.2002", HEDERA_OPERATOR_KEY: "no-se-usa-con-doble", HEDERA_TOPIC_ID: "0.0.1001" })[name];

  const submit = async (steps: Parameters<typeof scriptedHcsTransport>[0]) => {
    const { transport, behavior } = scriptedHcsTransport(steps);
    const client = createHcsClient({ readEnv: hederaEnv, transport: () => transport });
    const prepared = fakePreparedSubmission();
    return { outcome: await client.submitPrepared(prepared), behavior, prepared };
  };

  it("recibo exitoso, rechazo terminal y timeout incierto con efecto aplicado", async () => {
    const net = blockNetwork();
    restore = net.restore;
    const ok = await submit([{ kind: "ok", value: { status: "SUCCESS", sequenceNumber: "7" } }]);
    expect(ok.outcome).toMatchObject({ outcome: "recibido", sequenceNumber: "7" });
    expect(ok.behavior.calls[0].input.signedBytes).toEqual(ok.prepared.signedBytes);

    const rejected = await submit([{ kind: "fail", error: hcsStatusError("INVALID_TOPIC_ID") }]);
    expect(rejected.outcome).toMatchObject({ outcome: "fallido", status: "INVALID_TOPIC_ID" });

    let applied = 0;
    const uncertain = await submit([{ kind: "uncertain", effect: () => (applied += 1), error: hcsTimeoutError() }]);
    expect(uncertain.outcome).toMatchObject({ outcome: "incierto" });
    expect(applied).toBe(1);
    expect(net.attempts).toEqual([]);
  });

  it("bytes alterados no llegan al transporte", async () => {
    const { transport, behavior } = scriptedHcsTransport([{ kind: "ok", value: { status: "SUCCESS", sequenceNumber: "1" } }]);
    const client = createHcsClient({ readEnv: hederaEnv, transport: () => transport });
    const prepared = fakePreparedSubmission();
    prepared.signedBytes[0] ^= 1;
    expect(await client.submitPrepared(prepared)).toMatchObject({ outcome: "fallido", status: "LOCAL_BYTES_MISMATCH" });
    expect(behavior.calls).toHaveLength(0);
  });
});

describe("Mirror Node guionado contra el lector real", () => {
  const expected = {
    topicId: "0.0.1001",
    sequenceNumber: "7",
    reference: "b".repeat(32),
    manifestHash: "a".repeat(64),
    transactionId: "0.0.2002@1768478400.000000000",
  };
  const message = {
    topicId: "0.0.1001",
    sequenceNumber: "7",
    consensusTimestamp: "1768478405.123456789",
    payload: { reference: expected.reference, manifestHash: expected.manifestHash },
    transactionId: expected.transactionId,
  };

  it("coincide, aún no disponible, indisponible y no coincide", async () => {
    const { fetch: fetchDouble, behavior } = scriptedMirrorFetch([
      { kind: "ok", value: { status: 200, body: mirrorMessageBody(message) } },
      { kind: "ok", value: { status: 404 } },
      { kind: "ok", value: { status: 503 } },
      { kind: "fail", error: new Error("sin red") },
      { kind: "ok", value: { status: 200, body: mirrorMessageBody({ ...message, payload: { ...message.payload, manifestHash: "c".repeat(64) } }) } },
    ]);
    const reader = createMirrorReader({ fetch: fetchDouble });

    expect(await reader.checkMessage(expected)).toMatchObject({ result: "coincide", sequenceNumber: "7" });
    expect(await reader.checkMessage(expected)).toEqual({ result: "aun_no_disponible" });
    expect(await reader.checkMessage(expected)).toEqual({ result: "indisponible", reason: "http_503" });
    expect(await reader.checkMessage(expected)).toEqual({ result: "indisponible", reason: "red_o_timeout" });
    expect(await reader.checkMessage(expected)).toEqual({ result: "no_coincide", reason: "payload" });
    expect(behavior.calls[0].input.url).toBe(`${TESTNET_MIRROR_ORIGIN}/api/v1/topics/0.0.1001/messages/7`);
  });

  it("respuesta inválida contra Zod nunca cuenta como éxito", async () => {
    const { fetch: fetchDouble } = scriptedMirrorFetch([{ kind: "ok", value: { status: 200, body: { topic_id: 5 } } }]);
    expect(await createMirrorReader({ fetch: fetchDouble }).checkMessage(expected)).toEqual({ result: "indisponible", reason: "respuesta_invalida" });
  });

  it("el retraso usa tiempo simulado", async () => {
    const clock = createTestClock();
    const { fetch: fetchDouble } = scriptedMirrorFetch([{ kind: "delay", ms: 3000, then: { kind: "ok", value: { status: 404 } } }], clock);
    const pending = createMirrorReader({ fetch: fetchDouble }).checkMessage(expected);
    let done = false;
    void pending.then(() => (done = true));
    await clock.advance(2999);
    expect(done).toBe(false);
    await clock.advance(1);
    expect(await pending).toEqual({ result: "aun_no_disponible" });
  });
});
