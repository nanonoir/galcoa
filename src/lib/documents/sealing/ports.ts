import "server-only";

import type { createHcsClient } from "@/lib/hedera/client";
import type { createMirrorReader } from "@/lib/hedera/mirror";

/**
 * Puertos del servicio de sello (MVP-091/092; manifest-hcs §4–5). Alineados con
 * `hedera_attempts` y `hedera_registrations` (migración C3 20261016000300); el
 * adaptador SQL llega con su RPC. Los bytes firmados son privados: viajan solo
 * hacia el almacén, nunca a observaciones, auditoría ni DTO.
 */

export type HcsClientPort = Pick<ReturnType<typeof createHcsClient>, "prepareSubmission" | "submitPrepared">;
export type MirrorReaderPort = Pick<ReturnType<typeof createMirrorReader>, "checkMessage" | "locateTransaction">;

/** Versión finalizada: lo único que el sello necesita de ella. */
export type SealableVersion = {
  versionId: string;
  /** Referencia opaca (32 hex) que viaja en el payload. */
  reference: string;
  manifestHash: string;
};

/** Valores de `hedera_attempts.outcome`. `registrado` solo lo asienta `recordRegistration`. */
export type AttemptOutcome = "pendiente" | "registrado" | "fallido" | "incierto";

/** Observación mínima y sin secretos (`hedera_attempts.observation`). */
export type AttemptObservation = {
  topicId: string;
  network: "testnet";
  /** Secuencia del recibo SUCCESS, si se conoció: habilita consultar el Mirror. */
  sequenceNumber?: string;
  hederaStatus?: string;
  reason?: string;
};

export type AttemptRecord = {
  id: string;
  payloadHash: string;
  transactionId: string;
  outcome: AttemptOutcome;
  claimFencing: number;
  observation: AttemptObservation;
};

export type SealRegistration = {
  attemptId: string;
  payloadHash: string;
  network: "testnet";
  topicId: string;
  transactionId: string;
  sequenceNumber: string;
  /** `segundos.nanos` como string, sin pérdida. */
  consensusTimestamp: string;
};

export type SealIntent = {
  versionId: string;
  payload: Uint8Array;
  payloadHash: string;
  signedBytes: Uint8Array;
  transactionId: string;
  validStart: string;
  validUntil: string;
  topicId: string;
  network: "testnet";
};

export type RecordIntentResult = { ok: true; attemptId: string; claimFencing: number } | { ok: false; reason: "active_attempt" };

export type SealingStore = {
  loadVersion(versionId: string): Promise<SealableVersion | null>;
  /** Registro probado (si hay) y el último intento de la versión. */
  loadSealState(versionId: string): Promise<{ registration: SealRegistration | null; latestAttempt: AttemptRecord | null }>;
  /** Persiste la intención como `pendiente`; un solo intento activo por versión. Debe resolver **antes** de enviar. */
  recordIntent(intent: SealIntent): Promise<RecordIntentResult>;
  recordOutcome(input: {
    attemptId: string;
    claimFencing: number;
    outcome: Exclude<AttemptOutcome, "registrado">;
    observation: AttemptObservation;
  }): Promise<void>;
  /** Atómico: intento → `registrado` e inserción del registro comprobado. */
  recordRegistration(input: { claimFencing: number; registration: SealRegistration }): Promise<void>;
};
