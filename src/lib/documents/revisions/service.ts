import "server-only";

import { z } from "zod";

import { ConfirmationCommandSchema, ConfirmationResultSchema, type ConfirmationResult } from "@/lib/contracts/confirmation";
import { confirmationStatus } from "@/lib/rules/dimensions";

import type { SessionPort } from "../ports";
import { commandFingerprint, failure, IDEMPOTENCY_KEY_PATTERN, newId, type ServiceDeps, type ServiceResult } from "../result";

import { buildFrozenSnapshot, normalizeSelection } from "./freeze";
import type { FreezeReader, RevisionBundle, RevisionStore } from "./ports";

/**
 * Congelado del snapshot y confirmación del autor (MVP-070/071; PRD §5,
 * INV-11/12/14; SH-01/04).
 *
 * `freeze`: sesión y propiedad → `expectedDraftRevision` contra el borrador
 * vigente → contenido compartible con alias → hash JCS → persistencia atómica
 * (sustituye la revisión anterior, invalida sus enlaces, sin heredar
 * respuestas). Un cambio de contenido o de selección crea otra revisión; el
 * mismo contenido con la misma selección no. Una advertencia crítica **no**
 * bloquea: solo bloquean los problemas técnicos, los permisos y las
 * confirmaciones faltantes.
 *
 * `confirmAsAuthor`: el hash exacto, la casilla marcada y la revisión activa
 * se validan **antes** de registrar la respuesta; hay una sola por rol y,
 * si el autor está solo, su confirmación completa la revisión.
 */

export const FreezeCommandSchema = z.strictObject({
  documentId: z.string().min(1),
  expectedDraftRevision: z.number().int().nonnegative(),
  /** Roles elegidos; el servidor agrega al autor y fija el orden canónico. */
  selection: z.array(z.string()),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export type RevisionDeps = ServiceDeps & {
  session: SessionPort;
  source: FreezeReader;
  revisions: RevisionStore;
};

export function createRevisionService(deps: RevisionDeps) {
  const correlation = deps.newCorrelationId ?? newId;

  return {
    async freeze(command: unknown): Promise<ServiceResult<RevisionBundle & { unchanged: boolean }>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);

      const parsed = FreezeCommandSchema.safeParse(command);
      const selection = parsed.success ? normalizeSelection(parsed.data.selection) : null;
      if (!parsed.success || !selection) return failure("INVALID_INPUT", "validacion", false, correlationId);
      const { documentId, expectedDraftRevision, idempotencyKey } = parsed.data;

      try {
        const source = await deps.source.getFreezeSource(ownerId, documentId);
        if (!source) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        if (source.draft.draftRevision !== expectedDraftRevision) return failure("STALE_DRAFT", "congelado", false, correlationId);

        const frozen = buildFrozenSnapshot({
          content: source.draft.content,
          warnings: source.warnings,
          describeSource: (ref) => source.sourceDescriptions[ref] ?? "Fuente aportada",
          selection,
        });
        const result = await deps.revisions.freezeRevision({
          ownerId,
          documentId,
          expectedDraftRevision,
          content: frozen.content,
          snapshotHash: frozen.snapshotHash,
          canonicalHex: frozen.canonicalHex,
          controlStatus: source.controlStatus,
          sources: frozen.aliasTable.map(({ alias, ref }) => {
            const found = source.sourceRefs[ref];
            if (!found) throw new Error("Fuente sin referencia");
            return { alias, ...found };
          }),
          idempotency: {
            key: idempotencyKey,
            fingerprint: commandFingerprint({ schemaVersion: 1, action: "revision.freeze", documentId, expectedDraftRevision, selection }),
          },
          audit: { actorScope: ownerId, correlationId },
        });
        switch (result.status) {
          case "created":
            return { ok: true, value: { ...result.value, unchanged: false } };
          case "replayed":
            return { ok: true, value: { ...result.value, unchanged: false }, replayed: true };
          case "unchanged":
            return { ok: true, value: { ...result.value, unchanged: true } };
          case "stale_draft":
            return failure("STALE_DRAFT", "congelado", false, correlationId);
          case "idempotency_conflict":
            return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
          default:
            return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        }
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    async confirmAsAuthor(command: unknown): Promise<ServiceResult<ConfirmationResult>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);

      const parsed = ConfirmationCommandSchema.safeParse(command);
      if (!parsed.success || parsed.data.actor !== "autor" || parsed.data.decision !== "confirmar") {
        return failure("INVALID_INPUT", "validacion", false, correlationId);
      }
      const cmd = parsed.data;
      if (!IDEMPOTENCY_KEY_PATTERN.test(cmd.idempotencyKey)) return failure("INVALID_INPUT", "validacion", false, correlationId);

      try {
        const result = await deps.revisions.confirmAsAuthor({
          ownerId,
          documentId: cmd.documentId,
          revisionId: cmd.revisionId,
          snapshotId: cmd.snapshotId,
          snapshotHash: cmd.snapshotHash,
          idempotency: {
            key: cmd.idempotencyKey,
            fingerprint: commandFingerprint({
              schemaVersion: 1,
              action: "confirmation.author",
              documentId: cmd.documentId,
              revisionId: cmd.revisionId,
              snapshotId: cmd.snapshotId,
              snapshotHash: cmd.snapshotHash,
              decision: cmd.decision,
            }),
          },
          audit: { actorScope: ownerId, correlationId },
        });
        switch (result.status) {
          case "created":
          case "replayed": {
            const aggregate = confirmationStatus({ selection: result.selection, responses: result.responses, superseded: false });
            const value = ConfirmationResultSchema.parse({
              schemaVersion: 1,
              responseId: result.response.responseId,
              revisionId: result.response.revisionId,
              snapshotId: result.snapshotId,
              snapshotHash: result.response.snapshotHash,
              respondedAt: result.response.respondedAt,
              replayed: result.status === "replayed",
              confirmationStatus: aggregate,
              actor: { role: "autor", declaredName: null },
              outcome: { decision: "confirmar", checkboxChecked: true },
            });
            return { ok: true, value, replayed: result.status === "replayed" };
          }
          case "snapshot_mismatch":
            return failure("SNAPSHOT_MISMATCH", "confirmacion", false, correlationId);
          case "revision_not_active":
            return failure("REVISION_NOT_ACTIVE", "confirmacion", false, correlationId);
          case "already_responded":
            return failure("ALREADY_RESPONDED", "confirmacion", false, correlationId);
          case "idempotency_conflict":
            return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
          default:
            return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        }
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
