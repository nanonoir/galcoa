import { createHash } from "node:crypto";

import { buildHcsPayload } from "@/lib/hedera/payload";
import type { HcsTransport, PreparedSubmission } from "@/lib/hedera/client";

import type { TestClock } from "../support/clock";

import { ScriptedBehavior, type Step } from "./scripted";

/**
 * Dobles de HCS y Mirror Node contra los puertos reales (`src/lib/hedera/client.ts` y
 * `mirror.ts`), que siguen clasificando recibos, errores y respuestas. Sin SDK, sin red
 * y sin credenciales.
 *
 * - `scriptedHcsTransport`: se pasa a `createHcsClient({ transport })`. Pasos: recibo
 *   (`ok`), rechazo terminal (`fail` con error de estado), timeout con efecto aplicado
 *   (`uncertain`: el mensaje llegó a «HCS» pero el llamador solo ve el timeout).
 * - `scriptedMirrorFetch`: se pasa a `createMirrorReader({ fetch })`. Pasos `ok` llevan la
 *   respuesta; `fail` es indisponibilidad de red; `delay` reproduce retraso.
 */

export type HcsReceipt = { status: string; sequenceNumber: string | null };

export function scriptedHcsTransport(steps: readonly Step<HcsReceipt>[], clock?: TestClock) {
  const behavior = new ScriptedBehavior<{ signedBytes: Uint8Array; timeoutMs: number }, HcsReceipt>(steps, clock);
  const transport: HcsTransport = { execute: (signedBytes, timeoutMs) => behavior.run({ signedBytes, timeoutMs }) };
  return { transport, behavior };
}

/** Error con la forma que el SDK lanza ante un rechazo de recibo/precheck. */
export function hcsStatusError(status: string, name: "ReceiptStatusError" | "PrecheckStatusError" = "ReceiptStatusError") {
  return Object.assign(new Error(status), { name, status: { toString: () => status } });
}

/** Error de timeout del transporte real (`HcsTimeout`). */
export function hcsTimeoutError() {
  return Object.assign(new Error("timeout"), { name: "HcsTimeout" });
}

/** `PreparedSubmission` ficticio y coherente (hash de los bytes) para ejercer `submitPrepared` sin firmar. */
export function fakePreparedSubmission(
  input: { reference: string; manifestHash: string; transactionId?: string } = { reference: "b".repeat(32), manifestHash: "a".repeat(64) },
): PreparedSubmission {
  const payload = buildHcsPayload(input);
  const signedBytes = new TextEncoder().encode(`firmado-ficticio:${payload.text}`);
  return {
    network: "testnet",
    topicId: "0.0.1001",
    transactionId: input.transactionId ?? "0.0.2002@1768478400.000000000",
    validStart: "1768478400.000000000",
    payloadHash: payload.payloadHash,
    signedBytes,
    signedBytesHash: sha256Hex(signedBytes),
  };
}

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type MirrorMessage = {
  topicId: string;
  sequenceNumber: string;
  consensusTimestamp: string;
  payload: { reference: string; manifestHash: string };
  /** `account@segundos.nanos` del intento, si el mensaje lo informa. */
  transactionId?: string;
};

/** Cuerpo JSON que devolvería Mirror Node para un mensaje de tema. */
export function mirrorMessageBody(m: MirrorMessage): Record<string, unknown> {
  const { bytes } = buildHcsPayload(m.payload);
  const [account, validStart] = m.transactionId?.split("@") ?? [];
  return {
    topic_id: m.topicId,
    sequence_number: m.sequenceNumber,
    consensus_timestamp: m.consensusTimestamp,
    message: Buffer.from(bytes).toString("base64"),
    ...(account && validStart ? { chunk_info: { initial_transaction_id: { account_id: account, transaction_valid_start: validStart } } } : {}),
  };
}

export type MirrorResponse = { status: number; body?: unknown };

export function scriptedMirrorFetch(steps: readonly Step<MirrorResponse>[], clock?: TestClock) {
  const behavior = new ScriptedBehavior<{ url: string }, MirrorResponse>(steps, clock);
  const fetchDouble = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { status, body } = await behavior.run({ url }, init?.signal ?? undefined);
    return new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetch: fetchDouble, behavior };
}
