import { randomUUID } from "node:crypto";

import type { FrozenOperation, ParticipantRole, ParticipantSelection, ThirdPartyRole } from "@/lib/contracts/review";
import type {
  InvitationReadRecord,
  InvitationState,
  InvitationStore,
  PersistedResponse,
  RespondResult,
} from "@/lib/documents/invitations/ports";

/**
 * Doble en memoria de `InvitationStore`, exclusivo de tests. Imita las RPC de
 * emisión, revocación, lectura y respuesta: solo guarda el hash, un token
 * vigente por tercero y revisión, lectura sin efectos y respuesta + consumo +
 * agregado + idempotencia en una sección sin `await` (atómica en JS). El
 * vencimiento usa un reloj propio, como la base. No acredita transacciones ni
 * concurrencia reales (SH-09).
 */
type RevisionRow = {
  ownerId: string;
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  content: FrozenOperation;
  active: boolean;
  responses: (PersistedResponse | { role: "autor"; decision: "confirmar" | "rechazar" })[];
};

type InvitationRow = {
  invitationId: string;
  revisionId: string;
  role: ThirdPartyRole;
  tokenHash: string;
  status: "vigente" | "consumida" | "revocada";
  expiresAtMs: number;
  responseId: string | null;
};

export function createMemoryInvitations(options: { now?: () => number } = {}) {
  const clock = { now: options.now ?? (() => Date.now()) };
  const revisions = new Map<string, RevisionRow>();
  const invitations: InvitationRow[] = [];
  const idempotency = new Map<string, { fingerprint: string; value: unknown }>();
  const audit: { type: string; actorScope: string; correlationId: string }[] = [];
  let failWith: Error | null = null;
  const calls = { read: 0, respond: 0, issue: 0 };

  const stateOf = (row: InvitationRow): InvitationState => {
    if (row.status === "consumida") return "consumida";
    if (row.status === "revocada") return "revocada";
    if (!revisions.get(row.revisionId)?.active) return "sustituida";
    return clock.now() >= row.expiresAtMs ? "vencida" : "vigente";
  };

  const store: InvitationStore = {
    async issueInvitation(input) {
      calls.issue += 1;
      if (failWith) throw failWith;
      const rev = revisions.get(input.revisionId);
      if (!rev || rev.ownerId !== input.ownerId) return { status: "not_available" };
      const idemKey = `${input.ownerId}|issue|${input.idempotency.key}`;
      const known = idempotency.get(idemKey);
      if (known) {
        return known.fingerprint === input.idempotency.fingerprint
          ? { status: "replayed", invitationId: known.value as string }
          : { status: "idempotency_conflict" };
      }
      if (!rev.active) return { status: "revision_not_active" };
      if (!(rev.content.selection as readonly string[]).includes(input.role)) return { status: "role_not_selected" };

      const previous = invitations.find((i) => i.revisionId === input.revisionId && i.role === input.role && i.status === "vigente");
      if (previous) previous.status = "revocada";
      const row: InvitationRow = {
        invitationId: randomUUID(),
        revisionId: input.revisionId,
        role: input.role,
        tokenHash: input.tokenHash,
        status: "vigente",
        expiresAtMs: clock.now() + input.ttlSeconds * 1000,
        responseId: null,
      };
      invitations.push(row);
      idempotency.set(idemKey, { fingerprint: input.idempotency.fingerprint, value: row.invitationId });
      audit.push({ type: "invitation.issued", ...input.audit });
      return {
        status: "created",
        invitationId: row.invitationId,
        revisionId: row.revisionId,
        role: row.role,
        expiresAt: new Date(row.expiresAtMs).toISOString(),
        revokedInvitationId: previous?.invitationId ?? null,
      };
    },

    async revokeInvitation(input) {
      const row = invitations.find((i) => i.invitationId === input.invitationId);
      if (!row || revisions.get(row.revisionId)?.ownerId !== input.ownerId) return { status: "not_available" };
      if (row.status === "revocada") return { status: "already_revoked" };
      if (row.status === "vigente") row.status = "revocada";
      audit.push({ type: "invitation.revoked", ...input.audit });
      return { status: "revoked" };
    },

    async readByTokenHash(tokenHash) {
      calls.read += 1;
      if (failWith) throw failWith;
      const row = invitations.find((i) => i.tokenHash === tokenHash);
      if (!row) return null;
      const rev = revisions.get(row.revisionId)!;
      const record: InvitationReadRecord = {
        invitationId: row.invitationId,
        revisionId: rev.revisionId,
        snapshotId: rev.snapshotId,
        snapshotHash: rev.snapshotHash,
        role: row.role,
        selection: rev.content.selection,
        content: rev.content,
        state: stateOf(row),
        expiresAt: new Date(row.expiresAtMs).toISOString(),
      };
      return record;
    },

    async respondAtomically(input): Promise<RespondResult> {
      calls.respond += 1;
      if (failWith) throw failWith;
      const row = invitations.find((i) => i.tokenHash === input.tokenHash);
      if (!row) return { status: "not_available" };
      const rev = revisions.get(row.revisionId)!;
      const shape = (response: PersistedResponse, status: "created" | "replayed"): RespondResult => ({
        status,
        response,
        selection: rev.content.selection as ParticipantSelection,
        responses: rev.responses.map((r) => ({ role: r.role as ParticipantRole, response: r.decision === "confirmar" ? "confirmado" : "rechazado" })),
      });

      const idemKey = `${input.tokenHash}|respond|${input.idempotency.key}`;
      const known = idempotency.get(idemKey);
      if (known) {
        return known.fingerprint === input.idempotency.fingerprint ? shape(known.value as PersistedResponse, "replayed") : { status: "idempotency_conflict" };
      }
      const state = stateOf(row);
      if (state !== "vigente") return { status: "unavailable", state };
      const c = input.command;
      if (c.revisionId !== rev.revisionId || c.snapshotId !== rev.snapshotId || c.snapshotHash !== rev.snapshotHash) return { status: "snapshot_mismatch" };

      const response: PersistedResponse = {
        responseId: randomUUID(),
        revisionId: rev.revisionId,
        snapshotId: rev.snapshotId,
        snapshotHash: rev.snapshotHash,
        role: row.role,
        decision: c.decision,
        declaredName: c.declaredName,
        respondedAt: new Date(clock.now()).toISOString(),
      };
      rev.responses.push(response);
      row.status = "consumida";
      row.responseId = response.responseId;
      idempotency.set(idemKey, { fingerprint: input.idempotency.fingerprint, value: response });
      audit.push({ type: "confirmation.third_party", ...input.audit });
      return shape(response, "created");
    },
  };

  return {
    store,
    audit,
    calls,
    /** Alta de una revisión congelada (la crea MVP-070). */
    seedRevision(row: Omit<RevisionRow, "responses" | "active"> & { active?: boolean }) {
      revisions.set(row.revisionId, { ...row, active: row.active ?? true, responses: [] });
    },
    confirmAsAuthor(revisionId: string) {
      revisions.get(revisionId)!.responses.push({ role: "autor", decision: "confirmar" });
    },
    supersede(revisionId: string) {
      revisions.get(revisionId)!.active = false;
    },
    responsesOf: (revisionId: string) => revisions.get(revisionId)!.responses,
    /** Todo lo persistido, para comprobar que el token en claro nunca llega. */
    dump: () => JSON.stringify({ invitations, audit, idempotency: [...idempotency.entries()] }),
    advance(ms: number) {
      const base = clock.now;
      clock.now = () => base() + ms;
    },
    failWith(error: Error | null) {
      failWith = error;
    },
  };
}
