import "server-only";

import type { FrozenContent, ParticipantRole, ParticipantSelection, ThirdPartyRole } from "@/lib/contracts/review";

import type { AuditContext, IdempotencyInput } from "../ports";

/**
 * Persistencia de invitaciones y de la respuesta del tercero (MVP-072/073/074;
 * docs/design/data-transactions.md: `issue_invitation`, `revoke_invitation`,
 * lectura pública y `respond_invitation`). Solo existen el puerto y sus
 * dobles: las RPC atómicas con permisos mínimos para `anon`, el adaptador y
 * la migración dependen de MVP-025 y de la migración aditiva de F4; no hay
 * fallback productivo. Aquí nunca viaja el token en claro, solo su hash.
 */

/** Estado de la invitación según la base (con su propio reloj para el vencimiento). */
export type InvitationState = "vigente" | "consumida" | "revocada" | "vencida" | "sustituida";

export type IssueInvitationInput = {
  ownerId: string;
  revisionId: string;
  role: ThirdPartyRole;
  /** SHA-256 del token; el texto plano no llega a la base. */
  tokenHash: string;
  ttlSeconds: number;
  idempotency: IdempotencyInput;
  audit: AuditContext;
};

export type IssueInvitationResult =
  /** Emisión nueva; si había un token vigente para el mismo tercero y revisión, queda revocado. */
  | { status: "created"; invitationId: string; revisionId: string; role: ThirdPartyRole; expiresAt: string; revokedInvitationId: string | null }
  /** Misma clave repetida: la emisión ya existe y su token en claro no se recupera. */
  | { status: "replayed"; invitationId: string }
  | { status: "role_not_selected" }
  | { status: "revision_not_active" }
  /** El tercero ya respondió: un enlace nuevo no puede transferir ni repetir esa respuesta. */
  | { status: "already_responded" }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type RevokeInvitationResult = { status: "revoked" | "already_revoked" } | { status: "not_available" };

/** Lectura de solo lectura desde el snapshot persistido; jamás consume. */
export type InvitationReadRecord = {
  invitationId: string;
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  role: ThirdPartyRole;
  selection: ParticipantSelection;
  content: FrozenContent;
  state: InvitationState;
  expiresAt: string;
};

export type RespondInput = {
  tokenHash: string;
  /** Decisión y datos vistos por la persona; el token no viaja aquí. */
  command: {
    revisionId: string;
    snapshotId: string;
    snapshotHash: string;
    decision: "confirmar" | "rechazar";
    /** Confirmar exige casilla marcada; rechazar, vacía y ratificada (ya validado en el servicio). */
    checkboxChecked: boolean;
    rejectionRatified: boolean;
    declaredName: string;
  };
  idempotency: IdempotencyInput;
  audit: AuditContext;
};

export type PersistedResponse = {
  responseId: string;
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  role: ThirdPartyRole;
  decision: "confirmar" | "rechazar";
  declaredName: string;
  respondedAt: string;
};

export type RespondResult =
  | {
      status: "created" | "replayed";
      response: PersistedResponse;
      /** Selección y respuestas vigentes de la revisión tras escribir (para el agregado). */
      selection: ParticipantSelection;
      responses: { role: ParticipantRole; response: "confirmado" | "rechazado" }[];
    }
  /** La invitación ya no admite respuesta (consumida por otra decisión, vencida, revocada o sustituida). */
  | { status: "unavailable"; state: Exclude<InvitationState, "vigente"> }
  /** Revisión, snapshot o hash distintos de los de la invitación. */
  | { status: "snapshot_mismatch" }
  /** Falta que respondan antes los participantes anteriores (proveedor -> transportista -> comprador). */
  | { status: "confirmation_order" }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type InvitationStore = {
  issueInvitation(input: IssueInvitationInput): Promise<IssueInvitationResult>;
  revokeInvitation(input: { ownerId: string; invitationId: string; audit: AuditContext }): Promise<RevokeInvitationResult>;
  /** `null` si el hash no existe; no modifica nada. */
  readByTokenHash(tokenHash: string): Promise<InvitationReadRecord | null>;
  /** Respuesta, consumo, agregado, auditoría e idempotencia en una sola transacción. */
  respondAtomically(input: RespondInput): Promise<RespondResult>;
};
