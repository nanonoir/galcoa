import { describe, expect, it } from "vitest";

import { createSupabaseInvitationStore } from "@/lib/documents/invitations/supabase";

// Doble del RPC público; no hay base real. Acredita solo el mapeo del error del trigger de orden.
const respond = (message: string) =>
  createSupabaseInvitationStore({
    verifiedUserId: null,
    rpc: { rpc: async () => ({ data: null, error: { message } }) },
  }).respondAtomically({
    tokenHash: "a".repeat(64),
    command: { revisionId: "r", snapshotId: "s", snapshotHash: "h".repeat(64), decision: "confirmar", declaredName: null } as never,
    idempotency: { key: "k".repeat(16), fingerprint: "f" },
    audit: { correlationId: "c" },
  } as never);

describe("orden de confirmación (F-3)", () => {
  it("el error confirmation_order de la base es un resultado propio, no un fallo técnico", async () => {
    expect(await respond("confirmation_order")).toEqual({ status: "confirmation_order" });
  });

  it("cualquier otro error de SQL no cruza la frontera", async () => {
    await expect(respond("boom: detalle interno")).rejects.toThrow("Persistencia no disponible");
  });
});
