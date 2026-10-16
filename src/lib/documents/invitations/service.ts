import "server-only";

import { z } from "zod";

import { ConfirmationCommandSchema, ConfirmationResultSchema, type ConfirmationResult } from "@/lib/contracts/confirmation";
import { PublicInvitationSchema, type InvitationAvailability, type PublicInvitation } from "@/lib/contracts/public";
import { ThirdPartyRoleSchema, type ThirdPartyRole } from "@/lib/contracts/review";
import { confirmationStatus } from "@/lib/rules/dimensions";

import type { SessionPort } from "../ports";
import { commandFingerprint, failure, IDEMPOTENCY_KEY_PATTERN, newId, type ServiceDeps, type ServiceResult } from "../result";

import type { InvitationStore } from "./ports";
import { generateInvitationToken, hashInvitationToken, INVITATION_TTL_SECONDS, isWellFormedToken } from "./token";

/**
 * Invitaciones, lectura pública y respuesta del tercero (MVP-072/073/074;
 * PRD §5, INV-11/12/13; SH-02, SH-04; docs/specs/public-capabilities.md).
 *
 * - **Emisión:** solo el propietario con la revisión activa; token de 32 bytes
 *   en CSPRNG, solo su hash llega al puerto, el texto plano vuelve **una vez**
 *   al propietario. Repetir la misma clave no recupera el token: pide
 *   reemitir (`REISSUE_REQUIRED`); una clave nueva reemite y revoca la anterior.
 * - **Lectura:** de solo lectura desde el snapshot persistido y por allowlist
 *   (`PublicInvitationSchema`); nunca consume, ni siquiera por prefetch. Un
 *   token mal formado, inexistente o revocado da la misma respuesta.
 * - **Respuesta:** un único comando con nombre autodeclarado obligatorio en
 *   ambas decisiones; el puerto hace respuesta, consumo, agregado, auditoría e
 *   idempotencia en una transacción. El token en claro solo existe en esta
 *   capa: no se registra, no baja al puerto y no aparece en los errores.
 */

export const IssueCommandSchema = z.strictObject({
  revisionId: z.string().min(1),
  role: ThirdPartyRoleSchema,
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export type IssuedInvitation = {
  invitationId: string;
  revisionId: string;
  role: ThirdPartyRole;
  expiresAt: string;
  /** Texto plano: se entrega una única vez y no se persiste. */
  token: string;
};

export type InvitationRead =
  | { kind: "available"; invitation: PublicInvitation }
  | { kind: "unavailable"; availability: Exclude<InvitationAvailability, "disponible" | "revocada"> | "no_disponible" };

export type InvitationDeps = ServiceDeps & {
  session: SessionPort;
  invitations: InvitationStore;
  /** Inyectable para pruebas; por defecto CSPRNG de `node:crypto`. */
  newToken?: () => string;
  ttlSeconds?: number;
};

export function createInvitationService(deps: InvitationDeps) {
  const correlation = deps.newCorrelationId ?? newId;
  const newToken = deps.newToken ?? generateInvitationToken;

  return {
    async issue(command: unknown): Promise<ServiceResult<IssuedInvitation>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      const parsed = IssueCommandSchema.safeParse(command);
      if (!parsed.success) return failure("INVALID_INPUT", "validacion", false, correlationId);
      const { revisionId, role, idempotencyKey } = parsed.data;

      const token = newToken();
      try {
        const result = await deps.invitations.issueInvitation({
          ownerId,
          revisionId,
          role,
          tokenHash: hashInvitationToken(token),
          ttlSeconds: deps.ttlSeconds ?? INVITATION_TTL_SECONDS,
          idempotency: { key: idempotencyKey, fingerprint: commandFingerprint({ schemaVersion: 1, action: "invitation.issue", revisionId, role }) },
          audit: { actorScope: ownerId, correlationId },
        });
        switch (result.status) {
          case "created":
            return { ok: true, value: { invitationId: result.invitationId, revisionId: result.revisionId, role: result.role, expiresAt: result.expiresAt, token } };
          case "replayed":
            // El token en claro de una emisión ya hecha no se puede recuperar: se reemite con otra clave.
            return failure("REISSUE_REQUIRED", "persistencia", false, correlationId);
          case "role_not_selected":
            return failure("ROLE_NOT_SELECTED", "validacion", false, correlationId);
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

    async revoke(invitationId: unknown): Promise<ServiceResult<{ invitationId: string }>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      if (typeof invitationId !== "string" || invitationId.length === 0) return failure("INVALID_INPUT", "validacion", false, correlationId);
      try {
        const result = await deps.invitations.revokeInvitation({ ownerId, invitationId, audit: { actorScope: ownerId, correlationId } });
        return result.status === "not_available"
          ? failure("NOT_AVAILABLE", "persistencia", false, correlationId)
          : { ok: true, value: { invitationId }, replayed: result.status === "already_revoked" };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    /** GET de la invitación: sin sesión, sin consumo, mismo snapshot que ve el autor. */
    async read(token: unknown): Promise<ServiceResult<InvitationRead>> {
      const correlationId = correlation();
      if (!isWellFormedToken(token)) return { ok: true, value: { kind: "unavailable", availability: "no_disponible" } };
      try {
        const record = await deps.invitations.readByTokenHash(hashInvitationToken(token));
        if (!record) return { ok: true, value: { kind: "unavailable", availability: "no_disponible" } };
        switch (record.state) {
          case "vigente": {
            // Allowlist estricta: ningún id privado, chat ni evidencia.
            const invitation = PublicInvitationSchema.parse({
              schemaVersion: 1,
              revisionId: record.revisionId,
              snapshotId: record.snapshotId,
              snapshotHash: record.snapshotHash,
              role: record.role,
              selection: record.content.selection,
              operation: record.content.operation,
              warnings: record.content.warnings,
              availability: "disponible",
              expiresAt: record.expiresAt,
            });
            return { ok: true, value: { kind: "available", invitation } };
          }
          case "consumida":
            return { ok: true, value: { kind: "unavailable", availability: "ya_respondida" } };
          case "vencida":
            return { ok: true, value: { kind: "unavailable", availability: "caducada" } };
          case "sustituida":
            return { ok: true, value: { kind: "unavailable", availability: "sustituida" } };
          default:
            return { ok: true, value: { kind: "unavailable", availability: "no_disponible" } };
        }
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },

    /** POST de la respuesta: el token viaja en el cuerpo y se convierte en hash antes del puerto. */
    async respond(command: unknown): Promise<ServiceResult<ConfirmationResult>> {
      const correlationId = correlation();
      const parsed = ConfirmationCommandSchema.safeParse(command);
      if (!parsed.success || parsed.data.actor !== "tercero") return failure("INVALID_INPUT", "validacion", false, correlationId);
      const cmd = parsed.data;
      if (!IDEMPOTENCY_KEY_PATTERN.test(cmd.idempotencyKey)) return failure("INVALID_INPUT", "validacion", false, correlationId);
      if (!isWellFormedToken(cmd.token)) return failure("NOT_AVAILABLE", "confirmacion", false, correlationId);

      const rejected = cmd.decision === "rechazar";
      try {
        const result = await deps.invitations.respondAtomically({
          tokenHash: hashInvitationToken(cmd.token),
          command: {
            revisionId: cmd.revisionId,
            snapshotId: cmd.snapshotId,
            snapshotHash: cmd.snapshotHash,
            decision: cmd.decision,
            checkboxChecked: cmd.checkboxChecked,
            rejectionRatified: rejected,
            declaredName: cmd.declaredName,
          },
          idempotency: {
            key: cmd.idempotencyKey,
            fingerprint: commandFingerprint({
              schemaVersion: 1,
              action: "confirmation.third_party",
              revisionId: cmd.revisionId,
              snapshotId: cmd.snapshotId,
              snapshotHash: cmd.snapshotHash,
              decision: cmd.decision,
              declaredName: cmd.declaredName,
            }),
          },
          audit: { actorScope: "tercero", correlationId },
        });
        switch (result.status) {
          case "created":
          case "replayed": {
            const { response } = result;
            const value = ConfirmationResultSchema.parse({
              schemaVersion: 1,
              responseId: response.responseId,
              revisionId: response.revisionId,
              snapshotId: response.snapshotId,
              snapshotHash: response.snapshotHash,
              respondedAt: response.respondedAt,
              replayed: result.status === "replayed",
              confirmationStatus: confirmationStatus({ selection: result.selection, responses: result.responses, superseded: false }),
              actor: { role: response.role, declaredName: response.declaredName },
              outcome: response.decision === "confirmar" ? { decision: "confirmar", checkboxChecked: true } : { decision: "rechazar", checkboxChecked: false, rejectionRatified: true },
            });
            return { ok: true, value, replayed: result.status === "replayed" };
          }
          case "unavailable":
            return failure(
              { consumida: "ALREADY_RESPONDED", vencida: "INVITATION_EXPIRED", sustituida: "REVISION_SUPERSEDED", revocada: "NOT_AVAILABLE" }[result.state],
              "confirmacion",
              false,
              correlationId,
            );
          case "snapshot_mismatch":
            return failure("SNAPSHOT_MISMATCH", "confirmacion", false, correlationId);
          case "idempotency_conflict":
            return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
          default:
            return failure("NOT_AVAILABLE", "confirmacion", false, correlationId);
        }
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
