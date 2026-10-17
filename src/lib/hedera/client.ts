import "server-only";

import { createHash } from "node:crypto";

import {
  AccountId,
  Client,
  PrivateKey,
  Timestamp,
  TopicId,
  TopicMessageSubmitTransaction,
  Transaction,
  TransactionId,
} from "@hiero-ledger/sdk";

import { HEDERA_TIMEOUTS, readHederaConfig, type EnvReader, type HederaConfig } from "./config";
import type { HcsPayload } from "./payload";

/**
 * Cliente HCS cerrado, solo servidor y solo Testnet (MVP-090; manifest-hcs
 * §4). No es una herramienta para agentes: publica únicamente un payload
 * `galcoa.hcs.v1` ya armado, en un mensaje sin chunks.
 *
 * Dos pasos, para que la intención se persista **antes** de enviar (MVP-091):
 * 1. `prepareSubmission`: arma, congela y firma localmente, con ID de
 *    transacción explícito. No toca la red.
 * 2. `submitPrepared`: envía esos mismos bytes firmados (nunca regenera el ID)
 *    y clasifica el resultado. Un recibo exitoso es evidencia del intento, no
 *    `registrado`: eso exige además el cruce con Mirror (MVP-092/093).
 */

export type PreparedSubmission = {
  network: "testnet";
  topicId: string;
  transactionId: string;
  /** Inicio de validez, `segundos.nanos`. */
  validStart: string;
  payloadHash: string;
  /** Bytes firmados: capacidad de envío. Privados: nunca a logs, auditoría ni DTO. */
  signedBytes: Uint8Array;
  signedBytesHash: string;
};

export type SubmitOutcome =
  /** Recibo SUCCESS del ID exacto, con número de secuencia (string, sin pérdida). */
  | { outcome: "recibido"; transactionId: string; sequenceNumber: string; status: "SUCCESS" }
  /** Rechazo terminal de **ese** ID sin efecto en HCS: se puede preparar otro intento. */
  | { outcome: "fallido"; transactionId: string; status: string }
  /** Timeout, desconexión o estado ambiguo: no se reenvía; se reconcilia el mismo intento. */
  | { outcome: "incierto"; transactionId: string; reason: string };

/** Transporte real (SDK) o doble en tests: ejecuta bytes firmados y devuelve el recibo. */
export type HcsTransport = {
  execute(signedBytes: Uint8Array, timeoutMs: number): Promise<{ status: string; sequenceNumber: string | null }>;
};

/** Estados que no prueban ni éxito ni fracaso del ID: siempre incierto. */
const UNCERTAIN_STATUSES = new Set(["UNKNOWN", "RECEIPT_NOT_FOUND", "RECORD_NOT_FOUND", "BUSY", "PLATFORM_NOT_ACTIVE", "PLATFORM_TRANSACTION_NOT_CREATED"]);

export function classifySubmitError(transactionId: string, error: unknown): SubmitOutcome {
  const e = error as { name?: string; status?: { toString(): string } } | null;
  const status = e?.status?.toString();
  // Rechazos del SDK con estado terminal (precheck o recibo) prueban que ese ID no tuvo efecto.
  if ((e?.name === "ReceiptStatusError" || e?.name === "PrecheckStatusError") && status && !UNCERTAIN_STATUSES.has(status)) {
    return { outcome: "fallido", transactionId, status };
  }
  return { outcome: "incierto", transactionId, reason: status ?? e?.name ?? "error_desconocido" };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function buildClient(config: HederaConfig): Client {
  return Client.forTestnet().setOperator(AccountId.fromString(config.operatorId), PrivateKey.fromString(config.operatorKey));
}

/** Transporte del SDK con el plazo aprobado de envío y recibo. */
export function sdkTransport(config: HederaConfig): HcsTransport {
  return {
    async execute(signedBytes, timeoutMs) {
      const client = buildClient(config);
      try {
        const tx = Transaction.fromBytes(signedBytes);
        const run = (async () => {
          const response = await tx.execute(client);
          const receipt = await response.getReceipt(client);
          return { status: receipt.status.toString(), sequenceNumber: receipt.topicSequenceNumber?.toString() ?? null };
        })();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "HcsTimeout" })), timeoutMs);
        });
        try {
          return await Promise.race([run, timeout]);
        } finally {
          clearTimeout(timer);
        }
      } finally {
        client.close();
      }
    },
  };
}

export type HcsClientDeps = { readEnv?: EnvReader; transport?: (config: HederaConfig) => HcsTransport; now?: () => Date };

export function createHcsClient(deps: HcsClientDeps = {}) {
  return {
    /** Arma y firma localmente; sin red. La configuración se lee recién acá. */
    async prepareSubmission(payload: HcsPayload): Promise<PreparedSubmission> {
      const config = readHederaConfig(deps.readEnv);
      const client = buildClient(config);
      try {
        const operator = AccountId.fromString(config.operatorId);
        const transactionId = deps.now ? TransactionId.withValidStart(operator, Timestamp.fromDate(deps.now())) : TransactionId.generate(operator);
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(TopicId.fromString(config.topicId))
          .setMessage(payload.bytes)
          .setMaxChunks(1)
          .setTransactionId(transactionId)
          .freezeWith(client)
          .signWithOperator(client);
        const signedBytes = tx.toBytes();
        const validStart = transactionId.validStart!;
        return {
          network: "testnet",
          topicId: config.topicId,
          transactionId: transactionId.toString(),
          validStart: `${validStart.seconds.toString()}.${String(validStart.nanos.toString()).padStart(9, "0")}`,
          payloadHash: payload.payloadHash,
          signedBytes,
          signedBytesHash: sha256(signedBytes),
        };
      } finally {
        client.close();
      }
    },

    /** Envía exactamente los bytes preparados; nunca arma otra transacción. */
    async submitPrepared(prepared: PreparedSubmission): Promise<SubmitOutcome> {
      if (sha256(prepared.signedBytes) !== prepared.signedBytesHash) {
        return { outcome: "fallido", transactionId: prepared.transactionId, status: "LOCAL_BYTES_MISMATCH" };
      }
      const config = readHederaConfig(deps.readEnv);
      const transport = (deps.transport ?? sdkTransport)(config);
      try {
        const receipt = await transport.execute(prepared.signedBytes, HEDERA_TIMEOUTS.submitMs);
        if (receipt.status === "SUCCESS" && receipt.sequenceNumber && /^\d+$/.test(receipt.sequenceNumber)) {
          return { outcome: "recibido", transactionId: prepared.transactionId, sequenceNumber: receipt.sequenceNumber, status: "SUCCESS" };
        }
        if (receipt.status !== "SUCCESS" && !UNCERTAIN_STATUSES.has(receipt.status)) {
          return { outcome: "fallido", transactionId: prepared.transactionId, status: receipt.status };
        }
        return { outcome: "incierto", transactionId: prepared.transactionId, reason: receipt.status };
      } catch (error) {
        return classifySubmitError(prepared.transactionId, error);
      }
    },
  };
}
