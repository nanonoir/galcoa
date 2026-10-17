import "server-only";

import type { Draft } from "@/lib/contracts/core";
import type { ControlStatus } from "@/lib/contracts/document";
import type { ParticipantRole, ParticipantSelection, Revision, Snapshot, FrozenOperation } from "@/lib/contracts/review";
import type { ConsolidatedWarning } from "@/lib/rules/consolidate";

import type { AuditContext, IdempotencyInput } from "../ports";

/**
 * Persistencia de revisiones congeladas y de la confirmación del autor
 * (MVP-070/071; docs/design/data-transactions.md). Solo existen el puerto y
 * sus dobles: las RPC atómicas `freeze_revision` y `confirm_as_author` (locks
 * documento → revisión → invitaciones) y su adaptador dependen de la
 * migración aditiva de F4 y de MVP-025; no hay fallback productivo.
 */

/** Lo que el congelado necesita leer del propietario: borrador vigente y advertencias consolidadas. */
export type FreezeSource = {
  draft: Draft;
  /** Advertencias vigentes de esa revisión del borrador. */
  warnings: ConsolidatedWarning[];
  /** Descripciones compartibles por ref privada. */
  sourceDescriptions: Record<string, string>;
  /** Fuente real de cada ref privada (mensaje o evidencia del mismo documento). */
  sourceRefs: Record<string, { kind: "mensaje" | "evidencia"; id: string }>;
  /** Control documental de esta revisión del borrador (`sin_evaluar` sin reporte vigente). */
  controlStatus: ControlStatus;
};

export type FreezeReader = {
  /** `null` si el documento no es del propietario o no tiene borrador. */
  getFreezeSource(ownerId: string, documentId: string): Promise<FreezeSource | null>;
};

export type FreezeInput = {
  ownerId: string;
  documentId: string;
  /** Concurrencia optimista (SH-01): si la base tiene otra revisión del borrador, `stale_draft`. */
  expectedDraftRevision: number;
  content: FrozenOperation;
  snapshotHash: string;
  /** Bytes JCS del contenido (hex): la base recalcula el hash y exige que concuerde. */
  canonicalHex: string;
  controlStatus: ControlStatus;
  /** Mapeo privado alias → fuente real, para `snapshot_sources`. */
  sources: { alias: string; kind: "mensaje" | "evidencia"; id: string }[];
  idempotency: IdempotencyInput;
  audit: AuditContext;
};

export type RevisionBundle = { revision: Revision; snapshot: Snapshot };

export type FreezeResult =
  /** Revisión nueva: sustituye a la anterior, invalida sus enlaces y no hereda respuestas. */
  | { status: "created"; value: RevisionBundle; supersededRevisionId: string | null; invalidatedInvitations: number }
  /** Mismo comando repetido: devuelve lo ya persistido. */
  | { status: "replayed"; value: RevisionBundle }
  /** Mismo contenido y selección que la revisión activa: no se crea otra. */
  | { status: "unchanged"; value: RevisionBundle }
  | { status: "stale_draft" }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type AuthorResponse = {
  responseId: string;
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  role: ParticipantRole;
  decision: "confirmar" | "rechazar";
  respondedAt: string;
};

export type ConfirmAsAuthorInput = {
  ownerId: string;
  /** Documento de la ruta: la base exige que la revisión le pertenezca. */
  documentId: string;
  revisionId: string;
  /** Snapshot y hash exactos que el autor vio; la base los compara con los de la revisión antes de escribir. */
  snapshotId: string;
  snapshotHash: string;
  idempotency: IdempotencyInput;
  audit: AuditContext;
};

export type ConfirmAsAuthorResult =
  | {
      status: "created" | "replayed";
      response: AuthorResponse;
      /** Selección y respuestas vigentes de la revisión tras escribir (para el agregado). */
      selection: ParticipantSelection;
      responses: { role: ParticipantRole; response: "confirmado" | "rechazado" }[];
      snapshotId: string;
    }
  | { status: "snapshot_mismatch" }
  | { status: "revision_not_active" }
  | { status: "already_responded" }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type RevisionStore = {
  freezeRevision(input: FreezeInput): Promise<FreezeResult>;
  confirmAsAuthor(input: ConfirmAsAuthorInput): Promise<ConfirmAsAuthorResult>;
  /** Revisión activa del documento del propietario; `null` si no hay o no es suyo. */
  getActiveRevision(ownerId: string, documentId: string): Promise<RevisionBundle | null>;
};
