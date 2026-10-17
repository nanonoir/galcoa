import "server-only";

import { buildHcsPayload } from "@/lib/hedera/payload";

import type {
  AttemptObservation,
  AttemptRecord,
  HcsClientPort,
  MirrorReaderPort,
  SealRegistration,
  SealableVersion,
  SealingStore,
} from "./ports";

/**
 * Servicio de sello y reconciliación (MVP-091/092; SH-06; manifest-hcs §4–5).
 * Opera solo sobre versiones finalizadas y nunca toca el PDF ni la versión: un
 * fallo deja «finalizada; sello pendiente». Reglas:
 *
 * - La intención (payload + bytes firmados + ID) se persiste **antes** de enviar.
 * - `recibido` no es `registrado`: eso exige que el Mirror confirme topic,
 *   secuencia, payload e ID del intento.
 * - Un intento `pendiente`/`incierto` jamás se reenvía: se reconcilia con Mirror.
 * - Solo un intento `fallido` (rechazo terminal de ese ID, sin efecto en HCS)
 *   autoriza uno nuevo, con el mismo payload y un ID nuevo. Ni un 404, ni un
 *   timeout, ni la expiración de la ventana prueban ausencia.
 */

/** Ventana de validez persistida (manifest-hcs §8.2). */
export const VALID_DURATION_SECONDS = 120;

export type SealStatus = "no_iniciado" | "pendiente" | "registrado" | "fallido";

export type PendingReason =
  | "esperando_mirror"
  | "sin_localizador"
  | "mirror_indisponible"
  | "posible_reinicio_de_red"
  | "envio_incierto"
  | "intento_activo"
  | "resultado_no_persistido"
  | "discrepancia_mirror";

export type SealResult =
  | { status: "registrado"; registration: SealRegistration }
  | { status: "pendiente"; reason: PendingReason; attemptId?: string }
  /** `sent: false` = fallo técnico previo a cualquier envío; `true` = rechazo terminal de ese ID. */
  | { status: "fallido"; retryable: true; sent: boolean; code: string; attemptId?: string }
  | { status: "no_disponible" };

export type SealingDeps = {
  store: SealingStore;
  client: HcsClientPort;
  mirror: MirrorReaderPort;
  /** Inicio de la época de Testnet configurada, para detectar reinicios. */
  epochStartedAt?: string;
};

export function createSealingService(deps: SealingDeps) {
  const { store, client, mirror } = deps;

  async function reconcile(version: SealableVersion, attempt: AttemptRecord, sequenceNumber: string | undefined): Promise<SealResult> {
    if (!sequenceNumber) return { status: "pendiente", reason: "sin_localizador", attemptId: attempt.id };
    const check = await mirror.checkMessage({
      topicId: attempt.observation.topicId,
      sequenceNumber,
      reference: version.reference,
      manifestHash: version.manifestHash,
      transactionId: attempt.transactionId,
      epochStartedAt: deps.epochStartedAt,
    });
    switch (check.result) {
      case "coincide": {
        const registration: SealRegistration = {
          attemptId: attempt.id,
          payloadHash: attempt.payloadHash,
          network: "testnet",
          topicId: check.topicId,
          transactionId: attempt.transactionId,
          sequenceNumber: check.sequenceNumber,
          consensusTimestamp: check.consensusTimestamp,
        };
        try {
          await store.recordRegistration({ claimFencing: attempt.claimFencing, registration });
        } catch {
          // Probado en Mirror pero sin asentar: no se afirma registro; se reconcilia de nuevo.
          return { status: "pendiente", reason: "resultado_no_persistido", attemptId: attempt.id };
        }
        return { status: "registrado", registration };
      }
      case "no_coincide":
        // Discrepancia técnica: no registrado y sin reenvío automático.
        return { status: "pendiente", reason: "discrepancia_mirror", attemptId: attempt.id };
      case "posible_reinicio_de_red":
        return { status: "pendiente", reason: "posible_reinicio_de_red", attemptId: attempt.id };
      case "indisponible":
        return { status: "pendiente", reason: "mirror_indisponible", attemptId: attempt.id };
      case "aun_no_disponible":
        return { status: "pendiente", reason: "esperando_mirror", attemptId: attempt.id };
    }
  }

  async function send(version: SealableVersion, previous: AttemptRecord | null): Promise<SealResult> {
    const payload = buildHcsPayload({ reference: version.reference, manifestHash: version.manifestHash });
    // Un reintento reutiliza exactamente el payload del intento anterior.
    if (previous && previous.payloadHash !== payload.payloadHash) {
      return { status: "fallido", retryable: true, sent: false, code: "PAYLOAD_DISTINTO_AL_INTENTO" };
    }

    let prepared;
    try {
      prepared = await client.prepareSubmission(payload);
    } catch (error) {
      return { status: "fallido", retryable: true, sent: false, code: (error as { code?: string }).code ?? "PREPARACION_FALLIDA" };
    }
    const validStartMs = validStartToMs(prepared.validStart);
    const base: AttemptObservation = { topicId: prepared.topicId, network: prepared.network };

    let intent;
    try {
      intent = await store.recordIntent({
        versionId: version.versionId,
        payload: payload.bytes,
        payloadHash: payload.payloadHash,
        signedBytes: prepared.signedBytes,
        transactionId: prepared.transactionId,
        validStart: new Date(validStartMs).toISOString(),
        validUntil: new Date(validStartMs + VALID_DURATION_SECONDS * 1000).toISOString(),
        topicId: prepared.topicId,
        network: prepared.network,
      });
    } catch {
      // Sin intención persistida no se envía.
      return { status: "fallido", retryable: true, sent: false, code: "INTENCION_NO_PERSISTIDA" };
    }
    if (!intent.ok) return { status: "pendiente", reason: "intento_activo" };

    const attempt: AttemptRecord = {
      id: intent.attemptId,
      payloadHash: payload.payloadHash,
      transactionId: prepared.transactionId,
      outcome: "pendiente",
      claimFencing: intent.claimFencing,
      observation: base,
    };
    const settle = async (outcome: "pendiente" | "fallido" | "incierto", observation: AttemptObservation) => {
      try {
        await store.recordOutcome({ attemptId: attempt.id, claimFencing: attempt.claimFencing, outcome, observation });
        return true;
      } catch {
        return false;
      }
    };

    const result = await client.submitPrepared(prepared);
    switch (result.outcome) {
      case "fallido": {
        if (!(await settle("fallido", { ...base, hederaStatus: result.status }))) {
          return { status: "pendiente", reason: "resultado_no_persistido", attemptId: attempt.id };
        }
        return { status: "fallido", retryable: true, sent: true, code: result.status, attemptId: attempt.id };
      }
      case "incierto": {
        // Sin reintento: queda para reconciliar el mismo ID.
        const persisted = await settle("incierto", { ...base, reason: result.reason });
        return { status: "pendiente", reason: persisted ? "envio_incierto" : "resultado_no_persistido", attemptId: attempt.id };
      }
      case "recibido": {
        const observation = { ...base, hederaStatus: result.status, sequenceNumber: result.sequenceNumber };
        if (!(await settle("pendiente", observation))) {
          return { status: "pendiente", reason: "resultado_no_persistido", attemptId: attempt.id };
        }
        return reconcile(version, { ...attempt, observation }, result.sequenceNumber);
      }
    }
  }

  return {
    /** Inicia el sello, reconcilia o reintenta según el estado persistido. Nunca reenvía con un intento activo. */
    async seal(versionId: string): Promise<SealResult> {
      const version = await store.loadVersion(versionId);
      if (!version) return { status: "no_disponible" };
      const state = await store.loadSealState(versionId);
      if (state.registration) return { status: "registrado", registration: state.registration };
      const latest = state.latestAttempt;
      if (latest && (latest.outcome === "pendiente" || latest.outcome === "incierto")) {
        return reconcile(version, latest, latest.observation.sequenceNumber);
      }
      // Sin intento previo, o el último fue un rechazo terminal de su ID.
      return send(version, latest?.outcome === "fallido" ? latest : null);
    },

    /** Solo lectura de estado: nunca envía ni consulta la red. */
    async status(versionId: string): Promise<{ status: SealStatus; registration?: SealRegistration }> {
      const state = await store.loadSealState(versionId);
      if (state.registration) return { status: "registrado", registration: state.registration };
      const outcome = state.latestAttempt?.outcome;
      if (!outcome) return { status: "no_iniciado" };
      return { status: outcome === "fallido" ? "fallido" : "pendiente" };
    },
  };
}

function validStartToMs(validStart: string): number {
  const [seconds, nanos = "0"] = validStart.split(".");
  return Number(seconds) * 1000 + Math.floor(Number(nanos.padEnd(9, "0")) / 1e6);
}
