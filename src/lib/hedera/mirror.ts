import "server-only";

import { z } from "zod";

import { HEDERA_TIMEOUTS, TESTNET_MIRROR_ORIGIN } from "./config";
import { parseHcsPayload } from "./payload";

/**
 * Lector de Mirror Node (MVP-093; manifest-hcs §4–5). Origen fijo y confiable
 * de Testnet, nunca uno que venga del navegador o de un dato persistido.
 * Respuesta validada con Zod, base64 y UTF-8 estrictos, secuencia sin pérdida
 * y `consensus_timestamp` como string. Un 404, una demora o un 5xx **no**
 * prueban ausencia: son «aún no disponible» o «indisponible», nunca éxito.
 */

export type MirrorCheck =
  | { result: "coincide"; consensusTimestamp: string; sequenceNumber: string; topicId: string }
  | { result: "no_coincide"; reason: "topic" | "secuencia" | "payload" | "transaccion" }
  | { result: "aun_no_disponible" }
  | { result: "indisponible"; reason: string }
  | { result: "posible_reinicio_de_red" };

const MessageSchema = z.object({
  topic_id: z.string().regex(/^0\.0\.\d+$/),
  sequence_number: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  consensus_timestamp: z.string().regex(/^\d+\.\d{9}$/),
  message: z.string().max(4096),
  chunk_info: z
    .object({
      initial_transaction_id: z
        .object({ account_id: z.string(), transaction_valid_start: z.string() })
        .partial()
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

/** base64 estricto: rechaza caracteres fuera del alfabeto y relleno inválido. */
function decodeBase64(text: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return null;
  return new Uint8Array(Buffer.from(text, "base64"));
}

export type ExpectedRegistration = {
  topicId: string;
  sequenceNumber: string;
  reference: string;
  manifestHash: string;
  /** ID del intento (`0.0.x@segundos.nanos`), para correlacionar con el mensaje. */
  transactionId: string;
  /** Inicio de la época de Testnet configurada: un consenso anterior sugiere un reinicio. */
  epochStartedAt?: string;
};

export type MirrorDeps = { fetch?: typeof fetch; timeoutMs?: number };

export function createMirrorReader(deps: MirrorDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? HEDERA_TIMEOUTS.mirrorQueryMs;

  return {
    async checkMessage(expected: ExpectedRegistration): Promise<MirrorCheck> {
      if (!/^0\.0\.\d+$/.test(expected.topicId) || !/^\d+$/.test(expected.sequenceNumber)) {
        return { result: "indisponible", reason: "localizador_invalido" };
      }
      const url = `${TESTNET_MIRROR_ORIGIN}/api/v1/topics/${expected.topicId}/messages/${expected.sequenceNumber}`;
      let response: Response;
      try {
        response = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", headers: { accept: "application/json" } });
      } catch {
        return { result: "indisponible", reason: "red_o_timeout" };
      }
      if (response.status === 404) return { result: "aun_no_disponible" };
      if (!response.ok) return { result: "indisponible", reason: `http_${response.status}` };

      let parsed;
      try {
        parsed = MessageSchema.safeParse(await response.json());
      } catch {
        return { result: "indisponible", reason: "respuesta_invalida" };
      }
      if (!parsed.success) return { result: "indisponible", reason: "respuesta_invalida" };
      const m = parsed.data;
      const sequence = String(m.sequence_number);
      if (typeof m.sequence_number === "number" && !Number.isSafeInteger(m.sequence_number)) {
        return { result: "indisponible", reason: "secuencia_fuera_de_rango" };
      }

      if (m.topic_id !== expected.topicId) return { result: "no_coincide", reason: "topic" };
      if (sequence !== expected.sequenceNumber) return { result: "no_coincide", reason: "secuencia" };
      if (expected.epochStartedAt && compareTimestamps(m.consensus_timestamp, expected.epochStartedAt) < 0) {
        return { result: "posible_reinicio_de_red" };
      }
      const bytes = decodeBase64(m.message);
      const payload = bytes ? parseHcsPayload(bytes) : null;
      if (!payload || payload.reference !== expected.reference || payload.manifestHash !== expected.manifestHash) {
        return { result: "no_coincide", reason: "payload" };
      }
      const initial = m.chunk_info?.initial_transaction_id;
      if (initial?.account_id && initial.transaction_valid_start) {
        const fromMirror = `${initial.account_id}@${initial.transaction_valid_start}`;
        if (fromMirror !== expected.transactionId) return { result: "no_coincide", reason: "transaccion" };
      }
      return { result: "coincide", consensusTimestamp: m.consensus_timestamp, sequenceNumber: sequence, topicId: m.topic_id };
    },
  };
}

/** Compara `segundos.nanos` sin pasar por `Number` (sin pérdida de precisión). */
export function compareTimestamps(a: string, b: string): number {
  const [as, an = "0"] = a.split(".");
  const [bs, bn = "0"] = b.split(".");
  const sa = BigInt(as);
  const sb = BigInt(bs);
  if (sa !== sb) return sa < sb ? -1 : 1;
  const na = BigInt(an.padEnd(9, "0"));
  const nb = BigInt(bn.padEnd(9, "0"));
  return na === nb ? 0 : na < nb ? -1 : 1;
}
