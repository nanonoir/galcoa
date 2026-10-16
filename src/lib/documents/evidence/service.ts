import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { DeclaredEventDateSchema } from "@/lib/contracts/core";

import type { SessionPort } from "../ports";
import { commandFingerprint, failure, IDEMPOTENCY_KEY_PATTERN, newId, type ServiceDeps, type ServiceResult } from "../result";

import { EVIDENCE_LIMITS, EVIDENCE_MIME_TYPES, inspectEvidence } from "./inspect";
import type { DirectUploadPermit, EvidenceStorage, EvidenceStore, StoredEvidence } from "./ports";

/**
 * Evidencias: carga privada, hash y metadatos (MVP-042; REQ-04, INV-06/09;
 * sources-and-ai §7.1 y §7.5).
 *
 * Dos pasos, sin que los bytes pasen por una función (límite de 4,5 MB):
 * 1. `requestUpload` valida tipo declarado, tamaño y topes acumulados, reserva
 *    una ruta opaca y emite un permiso de subida directa y breve.
 * 2. `completeUpload` lee el objeto en el servidor y **revalida** contenido
 *    real, tamaño, hash, páginas o megapíxeles. Si no pasa, borra el objeto y
 *    descarta la reserva; si pasa, lo acepta como original inmutable.
 * Un rechazo es un error técnico con código estable, nunca una advertencia de
 * contenido: una imagen ilegible se acepta y la limitación la informa la extracción.
 */

export const UPLOAD_PERMIT_SECONDS = 120;
export const READ_URL_SECONDS = 60;

export const RequestUploadCommandSchema = z.strictObject({
  documentId: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().positive(),
  /** SHA-256 de los bytes calculado por el cliente; el servidor lo comprueba tras la subida. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  declaredEventDate: DeclaredEventDateSchema,
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export type EvidenceSummary = Omit<StoredEvidence, "privateLocation">;

/** Proyección sin la clave privada del objeto. */
export function toEvidenceSummary(evidence: StoredEvidence): EvidenceSummary {
  const { privateLocation, ...rest } = evidence;
  void privateLocation;
  return rest;
}

export type EvidenceServiceDeps = ServiceDeps & {
  session: SessionPort;
  store: EvidenceStore;
  storage: EvidenceStorage;
  newObjectId?: () => string;
};

const isMime = (m: string): m is (typeof EVIDENCE_MIME_TYPES)[number] => (EVIDENCE_MIME_TYPES as readonly string[]).includes(m);

export function createEvidenceService(deps: EvidenceServiceDeps) {
  const correlation = deps.newCorrelationId ?? newId;
  const objectId = deps.newObjectId ?? newId;

  return {
    async requestUpload(command: unknown): Promise<
      ServiceResult<{ evidence: EvidenceSummary; upload: DirectUploadPermit | null }>
    > {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);

      const parsed = RequestUploadCommandSchema.safeParse(command);
      if (!parsed.success) return failure("INVALID_INPUT", "validacion", false, correlationId);
      const { documentId, mimeType, byteLength, sha256, declaredEventDate, idempotencyKey } = parsed.data;
      // Texto directo es chat (MVP-041): no se admite como archivo.
      if (!isMime(mimeType)) return failure("EVIDENCE_UNSUPPORTED_TYPE", "validacion", false, correlationId);
      if (byteLength > EVIDENCE_LIMITS.maxFileBytes) return failure("EVIDENCE_TOO_LARGE", "validacion", false, correlationId);

      // Ruta opaca por documento: nunca el nombre que aporta el usuario.
      const privateLocation = `${documentId}/${objectId()}`;
      let reserved;
      try {
        reserved = await deps.store.reserveEvidence({
          ownerId,
          documentId,
          kind: mimeType === "application/pdf" ? "pdf" : "imagen",
          mimeType,
          byteLength,
          sha256,
          privateLocation,
          declaredEventDate,
          limits: { maxFiles: EVIDENCE_LIMITS.maxFilesPerDocument, maxTotalBytes: EVIDENCE_LIMITS.maxTotalBytesPerDocument },
          idempotency: {
            key: idempotencyKey,
            fingerprint: commandFingerprint({ schemaVersion: 1, action: "evidence.reserve", documentId, mimeType, byteLength, sha256, declaredEventDate }),
          },
        });
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
      if (reserved.status === "not_available") return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
      if (reserved.status === "idempotency_conflict") return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
      if (reserved.status === "limit_exceeded") {
        return failure(reserved.limit === "files" ? "EVIDENCE_LIMIT_FILES" : "EVIDENCE_LIMIT_TOTAL", "validacion", false, correlationId);
      }

      const evidence = reserved.evidence;
      const replayed = reserved.status === "replayed";
      if (evidence.uploadState === "accepted") return { ok: true, value: { evidence: toEvidenceSummary(evidence), upload: null }, replayed };
      try {
        const upload = await deps.storage.authorizeDirectUpload(evidence.privateLocation, {
          contentType: evidence.mimeType,
          maxBytes: evidence.byteLength,
          expiresAt: evidence.uploadExpiresAt,
        });
        return { ok: true, value: { evidence: toEvidenceSummary(evidence), upload }, replayed };
      } catch {
        return failure("STORAGE_FAILURE", "persistencia", true, correlationId);
      }
    },

    async completeUpload(command: { documentId: string; evidenceId: string }): Promise<ServiceResult<EvidenceSummary>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);

      let evidence: StoredEvidence | null;
      try {
        evidence = await deps.store.getEvidence(ownerId, command.documentId, command.evidenceId);
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
      if (!evidence) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
      if (evidence.uploadState === "accepted") return { ok: true, value: toEvidenceSummary(evidence), replayed: true };

      let bytes: Uint8Array | null;
      try {
        bytes = await deps.storage.download(evidence.privateLocation);
      } catch {
        return failure("STORAGE_FAILURE", "persistencia", true, correlationId);
      }
      // Sin objeto todavía: la reserva sigue vigente para reintentar la subida.
      if (!bytes) return failure("EVIDENCE_NOT_UPLOADED", "validacion", true, correlationId);

      const inspected = inspectEvidence(bytes, evidence.mimeType as (typeof EVIDENCE_MIME_TYPES)[number]);
      const rejection = !inspected.ok
        ? inspected.code
        : bytes.byteLength !== evidence.byteLength
          ? "EVIDENCE_SIZE_MISMATCH"
          : createHash("sha256").update(bytes).digest("hex") !== evidence.sha256
            ? "EVIDENCE_HASH_MISMATCH"
            : null;
      if (rejection) {
        // El objeto rechazado no es evidencia conservada: se borra y se libera el cupo.
        try {
          await deps.storage.remove(evidence.privateLocation);
          await deps.store.discardReservation({ ownerId, evidenceId: evidence.evidenceId });
        } catch {
          return failure("STORAGE_FAILURE", "persistencia", true, correlationId);
        }
        return failure(rejection, "validacion", false, correlationId);
      }

      try {
        const accepted = await deps.store.acceptEvidence({ ownerId, evidenceId: evidence.evidenceId, audit: { actorScope: ownerId, correlationId } });
        if (!accepted) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: toEvidenceSummary(accepted) };
      } catch {
        // El objeto queda en su ruta reservada; reintentar `completeUpload` lo adopta.
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    async listEvidences(documentId: string): Promise<ServiceResult<EvidenceSummary[]>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      try {
        const list = await deps.store.listEvidences(ownerId, documentId);
        if (!list) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: list.filter((e) => e.uploadState === "accepted").map(toEvidenceSummary) };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    /** URL firmada breve, solo para el propietario y solo de originales aceptados. */
    async readOriginal(command: { documentId: string; evidenceId: string }): Promise<ServiceResult<{ url: string; expiresAt: string }>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      try {
        const evidence = await deps.store.getEvidence(ownerId, command.documentId, command.evidenceId);
        if (!evidence || evidence.uploadState !== "accepted") return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: await deps.storage.createSignedRead(evidence.privateLocation, READ_URL_SECONDS) };
      } catch {
        return failure("STORAGE_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
