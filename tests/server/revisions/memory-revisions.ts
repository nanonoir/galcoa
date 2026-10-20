import { randomUUID } from "node:crypto";

import type { Draft } from "@/lib/contracts/core";
import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";
import type {
  AuthorResponse,
  ConfirmAsAuthorResult,
  FreezeReader,
  FreezeResult,
  FreezeSource,
  RevisionBundle,
  RevisionStore,
} from "@/lib/documents/revisions/ports";

/**
 * Doble en memoria de `RevisionStore` y `FreezeReader`, exclusivo de tests.
 * Imita lo que harán las RPC `freeze_revision` y `confirm_as_author`: todo o
 * nada, propiedad, idempotencia por clave y huella, sustitución de la revisión
 * activa con sus enlaces invalidados y sin herencia de respuestas. No acredita
 * locks ni transacciones reales (SH-09).
 */
export function createMemoryRevisions(options: { now?: () => string } = {}) {
  const now = options.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  const owners = new Map<string, string>();
  const sources = new Map<string, FreezeSource>();
  const rows: {
    bundle: RevisionBundle;
    ownerId: string;
    active: boolean;
    responses: AuthorResponse[];
    invitations: number;
  }[] = [];
  const idempotency = new Map<string, { fingerprint: string; value: unknown }>();
  const audit: { type: string; documentId?: string; revisionId?: string }[] = [];
  let failNext = false;

  const byDocument = (documentId: string) => rows.filter((r) => r.bundle.revision.documentId === documentId);
  const activeOf = (documentId: string) => byDocument(documentId).find((r) => r.active);

  const reader: FreezeReader = {
    async getFreezeSource(ownerId, documentId) {
      return owners.get(documentId) === ownerId ? (sources.get(documentId) ?? null) : null;
    },
  };

  const store: RevisionStore = {
    async freezeRevision(input): Promise<FreezeResult> {
      if (failNext) throw ((failNext = false), new Error("base caída"));
      if (owners.get(input.documentId) !== input.ownerId) return { status: "not_available" };
      const idemKey = `${input.ownerId}|freeze|${input.idempotency.key}`;
      const known = idempotency.get(idemKey);
      if (known) {
        return known.fingerprint === input.idempotency.fingerprint
          ? { status: "replayed", value: known.value as RevisionBundle }
          : { status: "idempotency_conflict" };
      }
      const draft = sources.get(input.documentId)!.draft;
      if (draft.draftRevision !== input.expectedDraftRevision) return { status: "stale_draft" };

      const current = activeOf(input.documentId);
      if (current && current.bundle.snapshot.snapshotHash === input.snapshotHash) {
        idempotency.set(idemKey, { fingerprint: input.idempotency.fingerprint, value: current.bundle });
        return { status: "unchanged", value: current.bundle };
      }

      const at = now();
      let invalidated = 0;
      if (current) {
        current.active = false;
        invalidated = current.invitations;
        current.invitations = 0;
      }
      const revisionId = randomUUID();
      const snapshotId = randomUUID();
      const bundle: RevisionBundle = {
        snapshot: {
          schemaVersion: 2,
          snapshotId,
          revisionId,
          documentId: input.documentId,
          content: input.content,
          snapshotHash: input.snapshotHash,
          frozenAt: at,
        },
        revision: {
          schemaVersion: 1,
          revisionId,
          documentId: input.documentId,
          snapshotId,
          snapshotHash: input.snapshotHash,
          selection: input.content.selection,
          frozenFromDraftRevision: input.expectedDraftRevision,
          supersedesRevisionId: current?.bundle.revision.revisionId ?? null,
          documentStatus: "esperando_confirmaciones",
          controlStatus: ({ rojo: "contradiccion_critica", amarillo: "con_advertencias", verde: "sin_inconsistencias_criticas_detectadas" } as const)[input.content.alc.color],
          confirmationStatus: "pendiente",
          createdAt: at,
        },
      };
      rows.push({ bundle, ownerId: input.ownerId, active: true, responses: [], invitations: 0 });
      idempotency.set(idemKey, { fingerprint: input.idempotency.fingerprint, value: bundle });
      audit.push({ type: "revision.frozen", documentId: input.documentId, revisionId });
      return { status: "created", value: bundle, supersededRevisionId: current?.bundle.revision.revisionId ?? null, invalidatedInvitations: invalidated };
    },

    async confirmAsAuthor(input): Promise<ConfirmAsAuthorResult> {
      if (failNext) throw ((failNext = false), new Error("base caída"));
      const row = rows.find((r) => r.bundle.revision.revisionId === input.revisionId);
      if (!row || row.ownerId !== input.ownerId || row.bundle.revision.documentId !== input.documentId) return { status: "not_available" };
      const rev = row.bundle.revision;
      const shape = (response: AuthorResponse, status: "created" | "replayed"): ConfirmAsAuthorResult => ({
        status,
        response,
        selection: rev.selection as ParticipantSelection,
        responses: row.responses.map((r) => ({ role: r.role as ParticipantRole, response: r.decision === "confirmar" ? "confirmado" : "rechazado" })),
        snapshotId: rev.snapshotId,
      });
      const idemKey = `${input.ownerId}|confirm|${input.idempotency.key}`;
      const known = idempotency.get(idemKey);
      if (known) {
        return known.fingerprint === input.idempotency.fingerprint ? shape(known.value as AuthorResponse, "replayed") : { status: "idempotency_conflict" };
      }
      if (!row.active) return { status: "revision_not_active" };
      if (input.snapshotHash !== rev.snapshotHash || input.snapshotId !== rev.snapshotId) return { status: "snapshot_mismatch" };
      if (row.responses.some((r) => r.role === "autor")) return { status: "already_responded" };
      const response: AuthorResponse = {
        responseId: randomUUID(),
        revisionId: rev.revisionId,
        snapshotId: rev.snapshotId,
        snapshotHash: rev.snapshotHash,
        role: "autor",
        decision: "confirmar",
        respondedAt: now(),
      };
      row.responses.push(response);
      idempotency.set(idemKey, { fingerprint: input.idempotency.fingerprint, value: response });
      audit.push({ type: "confirmation.author", revisionId: rev.revisionId });
      return shape(response, "created");
    },

    async getActiveRevision(ownerId, documentId) {
      const row = activeOf(documentId);
      return row && row.ownerId === ownerId ? row.bundle : null;
    },
  };

  return {
    store,
    reader,
    audit,
    /** Alta del documento y su borrador vigente (el borrador lo escribe MVP-051). */
    seed(ownerId: string, documentId: string, source: FreezeSource) {
      owners.set(documentId, ownerId);
      sources.set(documentId, source);
    },
    setDraft(documentId: string, draft: Draft, warnings?: FreezeSource["warnings"]) {
      const current = sources.get(documentId)!;
      sources.set(documentId, { ...current, draft, warnings: warnings ?? current.warnings });
    },
    /** Simula enlaces vigentes emitidos para la revisión activa (los emite MVP-072). */
    addInvitations(documentId: string, count: number) {
      activeOf(documentId)!.invitations += count;
    },
    responsesOf: (revisionId: string) => rows.find((r) => r.bundle.revision.revisionId === revisionId)?.responses ?? [],
    activeCount: (documentId: string) => byDocument(documentId).filter((r) => r.active).length,
    failNext: () => {
      failNext = true;
    },
  };
}
