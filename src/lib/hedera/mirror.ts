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

/**
 * Resultado de localizar un intento por su ID de transacción. Solo `fallo_terminal`
 * es evidencia de fracaso (la transacción alcanzó consenso y falló, sin efecto en
 * el topic); un 404 o una caída nunca son ausencia.
 */
export type TransactionLookup =
  | { result: "exitoso"; topicId: string; consensusTimestamp: string; sequenceNumber: string }
  | { result: "fallo_terminal"; status: string }
  | { result: "aun_no_disponible" }
  | { result: "indisponible"; reason: string };

const TransactionsSchema = z.object({
  transactions: z.array(
    z.object({
      result: z.string().min(1).max(64),
      name: z.string().max(64),
      entity_id: z.string().nullable().optional(),
      consensus_timestamp: z.string().regex(/^\d+\.\d{9}$/),
      transaction_id: z.string(),
      nonce: z.number().int().optional(),
    }),
  ),
});

const TopicMessagesSchema = z.object({
  messages: z.array(z.object({ sequence_number: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]) })),
});

const SDK_TRANSACTION_ID = /^(0\.0\.\d+)@(\d+)\.(\d{1,9})$/;

/** `0.0.x@s.n` (SDK) → `0.0.x-s-nnnnnnnnn` (Mirror); null si el formato no es válido. */
export function toMirrorTransactionId(sdkId: string): string | null {
  const m = SDK_TRANSACTION_ID.exec(sdkId);
  return m ? `${m[1]}-${m[2]}-${m[3].padEnd(9, "0")}` : null;
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

  /** GET JSON con tiempo límite; devuelve el cuerpo o el resultado no concluyente. */
  async function getJson(url: string): Promise<{ ok: true; body: unknown } | { ok: false; lookup: TransactionLookup }> {
    let response: Response;
    try {
      response = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", headers: { accept: "application/json" } });
    } catch {
      return { ok: false, lookup: { result: "indisponible", reason: "red_o_timeout" } };
    }
    if (response.status === 404) return { ok: false, lookup: { result: "aun_no_disponible" } };
    if (!response.ok) return { ok: false, lookup: { result: "indisponible", reason: `http_${response.status}` } };
    try {
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, lookup: { result: "indisponible", reason: "respuesta_invalida" } };
    }
  }

  return {
    async locateTransaction(transactionId: string, expectedTopicId: string): Promise<TransactionLookup> {
      const mirrorId = toMirrorTransactionId(transactionId);
      if (!mirrorId || !/^0\.0\.\d+$/.test(expectedTopicId)) return { result: "indisponible", reason: "localizador_invalido" };
      const tx = await getJson(`${TESTNET_MIRROR_ORIGIN}/api/v1/transactions/${mirrorId}`);
      if (!tx.ok) return tx.lookup;
      const parsed = TransactionsSchema.safeParse(tx.body);
      if (!parsed.success) return { result: "indisponible", reason: "respuesta_invalida" };
      // Solo la transacción raíz de ese ID (nonce 0); hijas o programadas no cuentan.
      const entry = parsed.data.transactions.find((t) => t.transaction_id === mirrorId && (t.nonce ?? 0) === 0);
      if (!entry) return { result: "aun_no_disponible" };
      if (entry.name !== "CONSENSUSSUBMITMESSAGE") return { result: "indisponible", reason: "transaccion_inesperada" };
      if (entry.result !== "SUCCESS") return { result: "fallo_terminal", status: entry.result };
      if (entry.entity_id !== expectedTopicId) return { result: "indisponible", reason: "topic_inesperado" };

      // La transacción no trae la secuencia: se obtiene por su marca de consenso exacta.
      const list = await getJson(
        `${TESTNET_MIRROR_ORIGIN}/api/v1/topics/${expectedTopicId}/messages?timestamp=eq:${entry.consensus_timestamp}&limit=1`,
      );
      if (!list.ok) return list.lookup;
      const messages = TopicMessagesSchema.safeParse(list.body);
      const first = messages.success ? messages.data.messages[0] : undefined;
      if (!first) return { result: "aun_no_disponible" };
      if (typeof first.sequence_number === "number" && !Number.isSafeInteger(first.sequence_number)) {
        return { result: "indisponible", reason: "secuencia_fuera_de_rango" };
      }
      return {
        result: "exitoso",
        topicId: expectedTopicId,
        consensusTimestamp: entry.consensus_timestamp,
        sequenceNumber: String(first.sequence_number),
      };
    },

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
