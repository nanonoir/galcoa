import { describe, expect, it } from "vitest";

import { createFinalizationStatusHandler, type FinalizationHttpDeps } from "@/lib/documents/finalization/http";
import { createSupabaseFinalizationStatusStore } from "@/lib/documents/finalization/supabase";

// Datos ficticios.
const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const REV = "33333333-3333-4333-8333-333333333333";
const operation = { operationId: "44444444-4444-4444-8444-444444444444", phase: "reserved", status: "active", versionNumber: 1 };

type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const rpcReturning = (data: unknown, error: unknown = null): Rpc => ({ rpc: async () => ({ data, error }) });
function deps(rpc: Rpc, session: unknown = { status: "authenticated", user: { id: USER, email: null } }): FinalizationHttpDeps {
  return { trustedOrigins: () => ["http://localhost:3000"], getContext: async () => ({ session: session as never, rpc }) };
}
const get = (headers: Record<string, string> = {}, method = "GET") => new Request("http://localhost:3000/x", { method, headers });

describe("MVP-080 · GET de estado de finalización", () => {
  it("el adaptador acepta found/no_operation/not_available y rechaza campos extra", async () => {
    const store = (data: unknown) => createSupabaseFinalizationStatusStore({ verifiedUserId: USER, session: rpcReturning(data) });
    const input = { documentId: DOC, revisionId: REV };
    expect((await store({ status: "found", operation }).status(input)).status).toBe("found");
    expect(await store({ status: "no_operation" }).status(input)).toEqual({ status: "no_operation" });
    await expect(store({ status: "found", operation: { ...operation, fencing: 1 } }).status(input)).rejects.toThrow();
    await expect(store({ status: "otro" }).status(input)).rejects.toThrow();
    await expect(createSupabaseFinalizationStatusStore({ verifiedUserId: USER, session: rpcReturning(null, { message: "boom secret" }) }).status(input)).rejects.toThrow("Persistencia no disponible");
  });

  it("devuelve el DTO mínimo y un 404 indistinguible", async () => {
    const handler = (data: unknown, session?: unknown) => createFinalizationStatusHandler(deps(rpcReturning(data), session));
    const ok = await handler({ status: "found", operation })(get(), DOC, REV);
    expect([ok.status, await ok.json()]).toEqual([200, { operation }]);
    const a = await handler({ status: "not_available" })(get(), DOC, REV);
    const b = await handler({ status: "no_operation" })(get(), DOC, REV);
    expect([a.status, b.status]).toEqual([404, 404]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.error.code).toBe("NOT_AVAILABLE");
    expect(jb.error.code).toBe("NOT_AVAILABLE");
  });

  it("aplica sesión, origen, método y validación de ids; los fallos son opacos", async () => {
    const h = (rpc: Rpc, session?: unknown) => createFinalizationStatusHandler(deps(rpc, session));
    const rpc = rpcReturning({ status: "no_operation" });
    expect((await h(rpc, { status: "anonymous" })(get(), DOC, REV)).status).toBe(401);
    expect((await h(rpc, { status: "unavailable" })(get(), DOC, REV)).status).toBe(503);
    expect((await h(rpc)(get({ Origin: "http://evil.test" }), DOC, REV)).status).toBe(403);
    expect((await h(rpc)(get({ "Sec-Fetch-Site": "cross-site" }), DOC, REV)).status).toBe(403);
    const post = await h(rpc)(get({}, "POST"), DOC, REV);
    expect([post.status, post.headers.get("Allow")]).toEqual([405, "GET"]);
    expect((await h(rpc)(get(), "x", REV)).status).toBe(404);
    const failed = await h(rpcReturning(null, { message: "secret sql" }))(get(), DOC, REV);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toMatch(/secret/);
  });
});
