import { createHash } from "node:crypto";

import type { ConfirmationCommand } from "@/lib/contracts/confirmation";
import { ConfirmationCommandSchema } from "@/lib/contracts/confirmation";
import type { Draft, Evidence, Message, DocumentRecord } from "@/lib/contracts/core";
import { DocumentRecordSchema, DraftSchema, EvidenceSchema, MessageSchema } from "@/lib/contracts/core";
import type { Revision, Snapshot } from "@/lib/contracts/review";
import { RevisionSchema, SnapshotSchema } from "@/lib/contracts/review";
import type { DocumentVersion, HcsSeal } from "@/lib/contracts/version";
import { DocumentVersionSchema, HcsSealSchema } from "@/lib/contracts/version";

/**
 * Constructores deterministas de datos ficticios (MVP-120). Cada uno valida su
 * resultado contra el contrato Zod real, así un cambio de contrato rompe aquí y no
 * silenciosamente en cada test. IDs y fechas son estables (sin `randomUUID`/`Date.now`).
 *
 * `fakeSha256` NO es la serialización canónica del snapshot (la define MVP-012/070):
 * es un SHA-256 estable de una etiqueta, solo para rellenar la forma del contrato.
 */

export const BUILDER_INSTANT = "2026-01-15T12:00:00.000Z";

export function fakeSha256(label: string): string {
  return createHash("sha256").update(`galcoa-test:${label}`).digest("hex");
}

/** Genera ids estables `prefijo-0001`; un contador por instancia, nunca global. */
export function createIdFactory(namespace = "t") {
  const counters = new Map<string, number>();
  return (kind: string): string => {
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    return `${namespace}-${kind}-${String(next).padStart(4, "0")}`;
  };
}

const DOC = "doc-0001";
const OWNER = "user-a";

export function buildDocumentRecord(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return DocumentRecordSchema.parse({
    documentId: DOC,
    ownerId: OWNER,
    title: "Operación ficticia",
    documentStatus: "borrador",
    controlStatus: "sin_evaluar",
    confirmationStatus: null,
    hcsStatus: "no_iniciado",
    activeRevisionId: null,
    createdAt: BUILDER_INSTANT,
    updatedAt: BUILDER_INSTANT,
    ...overrides,
  });
}

export function buildMessage(overrides: Partial<Message> = {}): Message {
  return MessageSchema.parse({
    messageId: "msg-0001",
    documentId: DOC,
    sender: "autor",
    content: "Vendí 12 cajas de tomates",
    declaredEventDate: { kind: "unknown" },
    uploadedAt: BUILDER_INSTANT,
    ...overrides,
  });
}

export function buildEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return EvidenceSchema.parse({
    evidenceId: "evd-0001",
    documentId: DOC,
    messageId: "msg-0001",
    kind: "pdf",
    mimeType: "application/pdf",
    byteLength: 1024,
    sha256: fakeSha256("evidence-1"),
    privateLocation: `${DOC}/evidence-0001`,
    declaredEventDate: { kind: "unknown" },
    uploadedAt: BUILDER_INSTANT,
    extractions: [],
    ...overrides,
  });
}

export function buildDraft(overrides: Partial<Draft> = {}): Draft {
  return DraftSchema.parse({
    draftId: "drf-0001",
    documentId: DOC,
    draftRevision: 1,
    content: { title: "Venta de tomates", body: "Se vendieron 12 cajas.", corrections: [] },
    updatedAt: BUILDER_INSTANT,
    ...overrides,
  });
}

export function buildSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return SnapshotSchema.parse({
    schemaVersion: 1,
    snapshotId: "snp-0001",
    revisionId: "rev-0001",
    documentId: DOC,
    content: {
      operation: { title: "Venta de tomates", body: "Se vendieron 12 cajas.", corrections: [] },
      warnings: [],
      selection: ["autor", "comprador"],
    },
    snapshotHash: fakeSha256("snapshot-1"),
    frozenAt: BUILDER_INSTANT,
    ...overrides,
  });
}

export function buildRevision(overrides: Partial<Revision> = {}): Revision {
  return RevisionSchema.parse({
    schemaVersion: 1,
    revisionId: "rev-0001",
    documentId: DOC,
    snapshotId: "snp-0001",
    snapshotHash: fakeSha256("snapshot-1"),
    selection: ["autor", "comprador"],
    frozenFromDraftRevision: 1,
    supersedesRevisionId: null,
    documentStatus: "esperando_confirmaciones",
    controlStatus: "sin_evaluar",
    confirmationStatus: "pendiente",
    createdAt: BUILDER_INSTANT,
    ...overrides,
  });
}

/** Confirmación del autor (sesión) por defecto; pasa `actor: "tercero"` y `token` para un tercero. */
export function buildConfirmationCommand(overrides: Record<string, unknown> = {}): ConfirmationCommand {
  const base = {
    schemaVersion: 1,
    revisionId: "rev-0001",
    snapshotId: "snp-0001",
    snapshotHash: fakeSha256("snapshot-1"),
    idempotencyKey: "idem-key-0001",
    actor: "autor",
    documentId: DOC,
    decision: "confirmar",
    checkboxChecked: true,
  };
  // `undefined` en un override quita el campo (p. ej. `documentId` en un comando de tercero).
  const merged = Object.fromEntries(Object.entries({ ...base, ...overrides }).filter(([, value]) => value !== undefined));
  return ConfirmationCommandSchema.parse(merged);
}

export function buildDocumentVersion(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  return DocumentVersionSchema.parse({
    schemaVersion: 1,
    versionId: "ver-0001",
    previousVersionId: null,
    documentId: DOC,
    revisionId: "rev-0001",
    snapshotId: "snp-0001",
    snapshotHash: fakeSha256("snapshot-1"),
    receipts: [{ responseId: "res-0001", role: "autor", declaredName: null, respondedAt: BUILDER_INSTANT }],
    pdf: { location: `${DOC}/published/pdf-0001`, sha256: fakeSha256("pdf-1"), byteLength: 2048 },
    manifest: { location: `${DOC}/published/manifest-0001`, sha256: fakeSha256("manifest-1"), byteLength: 512 },
    publicReference: "ref-opaca-0001",
    finalizedAt: BUILDER_INSTANT,
    ...overrides,
  });
}

export function buildHcsSeal(overrides: Partial<HcsSeal> = {}): HcsSeal {
  return HcsSealSchema.parse({
    schemaVersion: 1,
    versionId: "ver-0001",
    status: "no_iniciado",
    manifestHash: null,
    attempts: [],
    consensus: null,
    ...overrides,
  });
}
