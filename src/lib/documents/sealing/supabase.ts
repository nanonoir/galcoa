import "server-only";

import { z } from "zod";

import { newId } from "../result";
import type { DocumentRpc } from "../persistence/store";

import type { SealingStore } from "./ports";

/**
 * Adaptador SQL de `SealingStore` (migración 02507; manifest-hcs §4–5). Solo ejecutor `galcoa_executor`
 * con actor explícito (propietario de la versión): nunca `service_role` ni la sesión del propietario.
 * `signed_bytes` solo viaja hacia la base: ninguna RPC los devuelve. Un error de SDK/SQL o una respuesta
 * fuera de esquema se lanza como error opaco; el servicio lo trata como «no persistido» sin afirmar registro.
 */

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Observation = z.object({
  topicId: z.string().min(1),
  network: z.literal("testnet"),
  sequenceNumber: z.string().optional(),
  hederaStatus: z.string().optional(),
  reason: z.string().optional(),
});
const Registration = z.strictObject({
  attemptId: Uuid, payloadHash: Sha256, network: z.literal("testnet"), topicId: z.string().min(1), transactionId: z.string().min(1),
  sequenceNumber: z.string().regex(/^[1-9][0-9]*$/), consensusTimestamp: z.string().regex(/^[0-9]+\.[0-9]{1,9}$/),
});
const Attempt = z.strictObject({
  id: Uuid, payloadHash: Sha256, transactionId: z.string().min(1), outcome: z.enum(["pendiente", "registrado", "fallido", "incierto"]),
  claimFencing: z.number().int().positive(), observation: Observation,
});

const VersionResult = z.union([
  z.strictObject({ status: z.literal("ready"), versionId: Uuid, reference: z.string().min(1), manifestHash: Sha256 }),
  z.strictObject({ status: z.literal("not_available") }),
]);
const StateResult = z.union([
  z.strictObject({ status: z.literal("ok"), registration: Registration.nullable(), latestAttempt: Attempt.nullable() }),
  z.strictObject({ status: z.literal("not_available") }),
]);
const IntentResult = z.union([
  z.strictObject({ status: z.literal("recorded"), attemptId: Uuid, claimFencing: z.number().int().positive() }),
  z.strictObject({ status: z.enum(["active_attempt", "registered", "payload_mismatch", "not_available"]) }),
  // Carrera entre `check_seal_eligibility` y el intento: el servicio ya filtró; aquí se falla cerrado (lanza).
  z.strictObject({ status: z.literal("blocked"), code: z.string() }),
]);
const EligibilityResult = z.union([
  z.strictObject({ status: z.literal("allowed") }),
  z.strictObject({ status: z.literal("not_available") }),
  z.strictObject({
    status: z.literal("blocked"),
    code: z.enum(["evaluation_required", "stale_evaluation", "red", "selection_invalid", "confirmation_order", "confirmations_missing", "legacy_without_alc"]),
  }),
]);
const Status = (...values: [string, ...string[]]) => z.strictObject({ status: z.enum(values) });

/** `executor` debe ser el canal `galcoa_executor`; `verifiedUserId`, el propietario ya verificado. */
export function createSupabaseSealingStore(context: {
  verifiedUserId: string;
  executor: DocumentRpc;
  newCorrelationId?: () => string;
}): SealingStore {
  const correlation = context.newCorrelationId ?? newId;
  async function call<T>(schema: z.ZodType<T>, name: string, args: Record<string, unknown>): Promise<T> {
    if (!context.verifiedUserId) throw new Error("Operación no autorizada");
    const { data, error } = await context.executor.rpc(name, { p_actor_id: context.verifiedUserId, ...args });
    if (error) throw new Error("Persistencia no disponible");
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
    return parsed.data;
  }
  const bytes = (value: Uint8Array) => Buffer.from(value);

  return {
    async checkEligibility(versionId) {
      const r = await call(EligibilityResult, "check_seal_eligibility", { p_version_id: versionId, p_correlation_id: correlation() });
      // `not_available` (versión ajena o inexistente) es un fallo técnico: el sello falla cerrado, no se permite.
      if (r.status === "not_available") throw new Error("Versión no disponible para el sello");
      return r.status === "allowed" ? { allowed: true } : { allowed: false, code: r.code };
    },
    async loadVersion(versionId) {
      const r = await call(VersionResult, "get_seal_version", { p_version_id: versionId });
      return r.status === "ready" ? { versionId: r.versionId, reference: r.reference, manifestHash: r.manifestHash } : null;
    },
    async loadSealState(versionId) {
      const r = await call(StateResult, "get_seal_state", { p_version_id: versionId });
      return r.status === "ok" ? { registration: r.registration, latestAttempt: r.latestAttempt } : { registration: null, latestAttempt: null };
    },
    async recordIntent(intent) {
      const r = await call(IntentResult, "record_seal_intent", {
        p_version_id: intent.versionId,
        p_payload: bytes(intent.payload),
        p_payload_hash: intent.payloadHash,
        p_signed_bytes: bytes(intent.signedBytes),
        p_transaction_id: intent.transactionId,
        p_valid_start: intent.validStart,
        p_valid_until: intent.validUntil,
        p_topic_id: intent.topicId,
        p_network: intent.network,
        p_correlation_id: correlation(),
      });
      if (r.status === "recorded") return { ok: true, attemptId: r.attemptId, claimFencing: r.claimFencing };
      if (r.status === "active_attempt") return { ok: false, reason: "active_attempt" };
      throw new Error("Intención no persistida");
    },
    async recordOutcome(input) {
      const r = await call(Status("recorded", "stale_fencing", "terminal", "not_available"), "record_seal_outcome", {
        p_attempt_id: input.attemptId,
        p_fencing: input.claimFencing,
        p_outcome: input.outcome,
        p_observation: input.observation,
        p_correlation_id: correlation(),
      });
      if (r.status !== "recorded") throw new Error("Resultado no persistido");
    },
    async recordRegistration({ claimFencing, registration }) {
      const r = await call(Status("registered", "already_registered", "stale_fencing", "terminal", "mismatch", "not_available"), "record_seal_registration", {
        p_attempt_id: registration.attemptId,
        p_fencing: claimFencing,
        p_payload_hash: registration.payloadHash,
        p_network: registration.network,
        p_topic_id: registration.topicId,
        p_transaction_id: registration.transactionId,
        p_sequence_number: registration.sequenceNumber,
        p_consensus_timestamp: registration.consensusTimestamp,
        p_correlation_id: correlation(),
      });
      if (r.status !== "registered" && r.status !== "already_registered") throw new Error("Registro no persistido");
    },
  };
}
