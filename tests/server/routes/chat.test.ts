import { describe, expect, it, vi } from "vitest";

import { createChatHttpHandler, type ChatServices } from "@/lib/documents/chat-http";
import { createDraftReader } from "@/lib/documents/revisions/draft-reader";
import type { SessionCheck } from "@/lib/supabase/auth";

const owner = "aaf3163d-8ec5-411d-a7ac-9219f47fb9b1";
const doc = "dc6e5bb1-c726-45bb-a048-97810495992b";
const authenticated: SessionCheck = { status: "authenticated", user: { id: owner, email: null } };
const draft = {
  draftId: "0b7f3b5e-2c0e-4a77-9a41-1d1e6f8f9a10", documentId: doc, draftRevision: 3,
  content: { title: "Operación", body: "Texto", corrections: [] }, updatedAt: "2026-10-16T12:00:00Z",
};

function setup(session: SessionCheck = authenticated) {
  const contrastDraft = vi.fn(async () => ({ ok: true as const, value: { reportId: "r1" } }));
  const startTurn = vi.fn(async () => ({
    ok: true as const,
    value: {
      turn: { turnId: "t1" },
      events: (async function* () {
        yield { type: "done" };
      })(),
    },
  }));
  const services = { turns: { startTurn }, contrast: { contrastDraft } } as unknown as ChatServices;
  const forUser = vi.fn((id: string) => {
    expect(id).toBe(owner);
    return services;
  });
  const deps = { getContext: async () => ({ session, forUser }), trustedOrigins: () => ["https://galcoa.test"] };
  return { deps, forUser, contrastDraft, startTurn };
}
const post = (body: unknown = {}, headers: Record<string, string> = { Origin: "https://galcoa.test" }) =>
  new Request("https://galcoa.test/x", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("rutas de chat y contraste (dobles; sin proveedores ni Postgres)", () => {
  it.each(["turn", "contrast"] as const)("%s: método, origen, sesión e id fallan cerrado antes de componer servicios", async (action) => {
    const ok = setup();
    const handler = createChatHttpHandler(ok.deps, action);
    expect((await handler(new Request("https://galcoa.test/x"), doc)).status).toBe(405);
    expect((await handler(post({}, {}), doc)).status).toBe(403);
    expect((await handler(post({}, { Origin: "https://galcoa.test", "Sec-Fetch-Site": "cross-site" }), doc)).status).toBe(403);
    expect((await handler(post(), "no-uuid")).status).toBe(404);
    expect(ok.forUser).not.toHaveBeenCalled();
    for (const [session, status] of [[{ status: "anonymous" }, 401], [{ status: "unavailable" }, 503]] as const) {
      const other = setup(session as SessionCheck);
      expect((await createChatHttpHandler(other.deps, action)(post(), doc)).status).toBe(status);
      expect(other.forUser).not.toHaveBeenCalled();
    }
  });

  it("turn: arranca con el actor de la sesión y sin tomar actor ni documento del body", async () => {
    const { deps, startTurn } = setup();
    const response = await createChatHttpHandler(deps, "turn")(post({ clientMessageId: "k1", content: "hola", documentId: "otro", ownerId: "x" }), doc);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"type":"done"}\n');
    expect(startTurn).toHaveBeenCalledWith(expect.objectContaining({ documentId: doc }), expect.any(AbortSignal));
  });

  it("contrast: devuelve el reporte; los fallos usan el estado del código y no filtran detalles", async () => {
    const { deps, contrastDraft } = setup();
    const ok = await createChatHttpHandler(deps, "contrast")(post(), doc);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ outcome: "completed", result: { reportId: "r1" } });
    expect(contrastDraft).toHaveBeenCalledWith(expect.objectContaining({ documentId: doc }));
    for (const [code, status] of [["NO_DRAFT", 409], ["STALE_DRAFT", 409], ["AI_PROVIDER_ERROR", 503]] as const) {
      contrastDraft.mockResolvedValueOnce({ ok: false, error: { code, stage: "ia", retryable: status === 503, correlationId: "c" } } as never);
      expect((await createChatHttpHandler(deps, "contrast")(post(), doc)).status).toBe(status);
    }
    contrastDraft.mockRejectedValueOnce(new Error("fake-secret"));
    const failed = await createChatHttpHandler(deps, "contrast")(post(), doc);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("fake-secret");
  });
});

describe("lector del borrador vigente (get_freeze_source)", () => {
  const reader = (rpc: () => Promise<{ data: unknown; error: unknown }>, verifiedUserId = owner) => createDraftReader({ verifiedUserId, session: { rpc } });

  it("devuelve solo el borrador y tolera reportes ajenos a su forma", async () => {
    const rpc = vi.fn(async () => ({ data: { draft, report: { result: "corrupto" }, agent1: 7 }, error: null }));
    expect(await reader(rpc)(owner, doc)).toEqual(draft);
    expect(rpc).toHaveBeenCalledWith("get_freeze_source", { p_document_id: doc });
  });

  it("sin borrador o documento ajeno: null; actor distinto, error o forma inválida: rechaza", async () => {
    expect(await reader(async () => ({ data: null, error: null }))(owner, doc)).toBeNull();
    await expect(reader(async () => ({ data: null, error: null }))("otro", doc)).rejects.toThrow();
    await expect(reader(async () => ({ data: null, error: { code: "x", message: "fake-secret" } }))(owner, doc)).rejects.toThrow("Persistencia no disponible");
    await expect(reader(async () => ({ data: { draft: { ...draft, documentId: "otro" } }, error: null }))(owner, doc)).rejects.toThrow();
    await expect(reader(async () => ({ data: { draft: { nope: 1 } }, error: null }))(owner, doc)).rejects.toThrow();
  });
});
