import { describe, expect, it } from "vitest";

import { createClaimFinalizationHandler, type FinalizationHttpDeps } from "@/lib/documents/finalization/http";
import { createSupabaseFinalizationStore } from "@/lib/documents/finalization/supabase";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

// Datos ficticios.
const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const REV = "33333333-3333-4333-8333-333333333333";
const op = {
  operationId: "44444444-4444-4444-8444-444444444444", revisionId: REV, snapshotId: "55555555-5555-4555-8555-555555555555",
  snapshotHash: "a".repeat(64), versionId: "66666666-6666-4666-8666-666666666666", versionNumber: 1, previousVersionId: null,
  renderer: "react-pdf-v1", phase: "reserved", status: "active", leaseExpiresAt: "2026-10-17T00:00:00.000Z",
};

type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const rpcReturning = (data: unknown, error: unknown = null): Rpc => ({ rpc: async () => ({ data, error }) });

function deps(rpc: Rpc, session: unknown = { status: "authenticated", user: { id: USER, email: null } }): FinalizationHttpDeps {
  return { trustedOrigins: () => ["http://localhost:3000"], getContext: async () => ({ session: session as never, rpc }) };
}
const post = (over: Record<string, string> = {}, method = "POST") =>
  new Request("http://localhost:3000/x", { method, headers: { Origin: "http://localhost:3000", ...over } });

describe("MVP-080 · adaptador y handler de claim_finalization", () => {
  it("el adaptador acepta cada estado conocido y rechaza lo desconocido o con campos extra", async () => {
    const store = (data: unknown) => createSupabaseFinalizationStore({ verifiedUserId: USER, session: rpcReturning(data) });
    const input = { documentId: DOC, revisionId: REV, renderer: "react-pdf-v1", leaseSeconds: 60, correlationId: "c" };
    for (const status of ["rejected", "confirmations_missing", "revision_not_active", "draft_changed", "not_available"]) {
      expect(await store({ status }).claim(input)).toEqual({ status });
    }
    expect((await store({ status: "claimed", operation: { ...op, fencing: 1 } }).claim(input)).status).toBe("claimed");
    expect((await store({ status: "resumed", operation: { ...op, fencing: 2 } }).claim(input)).status).toBe("resumed");
    expect((await store({ status: "in_progress", operation: op }).claim(input)).status).toBe("in_progress");
    expect((await store({ status: "published", operation: { ...op, phase: "published" } }).claim(input)).status).toBe("published");
    await expect(store({ status: "otro" }).claim(input)).rejects.toThrow();
    await expect(store({ status: "in_progress", operation: { ...op, fencing: 1 } }).claim(input)).rejects.toThrow();
    await expect(store({ status: "claimed", operation: op }).claim(input)).rejects.toThrow();
    await expect(store({ status: "rejected", extra: 1 }).claim(input)).rejects.toThrow();
    await expect(store({ status: "in_progress", operation: { ...op, revisionId: DOC } }).claim(input)).rejects.toThrow();
    await expect(createSupabaseFinalizationStore({ verifiedUserId: USER, session: rpcReturning(null, { message: "boom secret" }) }).claim(input)).rejects.toThrow("Persistencia no disponible");
  });

  it("proyecta un DTO sin hashes ni fencing y mapea los estados a códigos estables", async () => {
    const handler = (data: unknown, session?: unknown) => createClaimFinalizationHandler(deps(rpcReturning(data), session));
    const claimed = await handler({ status: "claimed", operation: { ...op, fencing: 7 } })(post(), DOC, REV);
    expect(claimed.status).toBe(201);
    const body = await claimed.json();
    expect(body).toEqual({ outcome: "claimed", operation: { operationId: op.operationId, phase: "reserved", status: "active", versionNumber: 1 } });
    expect(JSON.stringify(body)).not.toMatch(/fencing|snapshotHash|versionId/);
    expect((await handler({ status: "in_progress", operation: op })(post(), DOC, REV)).status).toBe(200);
    const expected = { rejected: "CONFIRMATION_REJECTED", confirmations_missing: "CONFIRMATIONS_MISSING", revision_not_active: "REVISION_NOT_ACTIVE", draft_changed: "DRAFT_CHANGED" };
    for (const [status, code] of Object.entries(expected)) {
      const r = await handler({ status })(post(), DOC, REV);
      expect([r.status, (await r.json()).error.code]).toEqual([409, code]);
    }
    expect((await handler({ status: "not_available" })(post(), DOC, REV)).status).toBe(404);
  });

  it("método, origen, Sec-Fetch-Site, sesión, UUID y errores opacos", async () => {
    const ok = createClaimFinalizationHandler(deps(rpcReturning({ status: "not_available" })));
    expect((await ok(post({}, "GET"), DOC, REV)).status).toBe(405);
    expect((await ok(post({ Origin: "https://evil.example" }), DOC, REV)).status).toBe(403);
    expect((await ok(new Request("http://localhost:3000/x", { method: "POST" }), DOC, REV)).status).toBe(403);
    expect((await ok(post({ "Sec-Fetch-Site": "cross-site" }), DOC, REV)).status).toBe(403);
    expect((await ok(post(), "no-uuid", REV)).status).toBe(404);
    expect((await ok(post(), DOC, "no-uuid")).status).toBe(404);
    const anon = createClaimFinalizationHandler(deps(rpcReturning(null), { status: "anonymous" }));
    expect((await anon(post(), DOC, REV)).status).toBe(401);
    const down = createClaimFinalizationHandler(deps(rpcReturning(null), { status: "unavailable" }));
    expect((await down(post(), DOC, REV)).status).toBe(503);
    const broken = await createClaimFinalizationHandler(deps(rpcReturning(null, { message: "relation secret" })))(post(), DOC, REV);
    expect(broken.status).toBe(503);
    expect(JSON.stringify(await broken.json())).not.toMatch(/secret/);
  });

  it("freeze_revision: el restrict_violation del claim activo sale como resultado controlado; otros errores no", async () => {
    const freeze = (error: unknown) =>
      createSupabaseRevisionAdapters({ verifiedUserId: USER, session: rpcReturning(null, error) }).store.freezeRevision({
        ownerId: USER, documentId: DOC, expectedDraftRevision: 1, snapshotHash: "a", canonicalHex: "00", controlStatus: "sin_evaluar",
        content: {} as never, sources: [], idempotency: { key: "k", fingerprint: "f" }, audit: { actorScope: USER, correlationId: "c" },
      } as never);
    expect(await freeze({ code: "23001", message: "document_revisions: hay una finalización en curso para esta revisión" })).toEqual({ status: "finalization_in_progress" });
    await expect(freeze({ code: "23001", message: "otra restricción" })).rejects.toThrow("Persistencia no disponible");
    await expect(freeze({ code: "XX000", message: "hay una finalización en curso" })).rejects.toThrow("Persistencia no disponible");
  });
});
