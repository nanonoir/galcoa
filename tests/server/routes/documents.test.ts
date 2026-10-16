import { describe, expect, it, vi } from "vitest";

import { createDocumentHttpHandler } from "@/lib/documents/http";
import type { DocumentStore } from "@/lib/documents/ports";
import type { SessionCheck } from "@/lib/supabase/auth";

const owner = "aaf3163d-8ec5-411d-a7ac-9219f47fb9b1";
const doc = "dc6e5bb1-c726-45bb-a048-97810495992b";
const record = {
  documentId: doc, ownerId: owner, title: "Documento", documentStatus: "borrador", controlStatus: "sin_evaluar",
  confirmationStatus: null, hcsStatus: "no_iniciado", activeRevisionId: null,
  createdAt: "2026-10-16T12:00:00Z", updatedAt: "2026-10-16T12:00:00Z",
} as const;
const message = { messageId: "mensaje", documentId: doc, sender: "autor", content: " Original ",
  declaredEventDate: { kind: "unknown" }, uploadedAt: "2026-10-16T12:00:00Z" } as const;
const authenticated: SessionCheck = { status: "authenticated", user: { id: owner, email: null } };

function setup(session: SessionCheck = authenticated) {
  const store = {
    createDocument: vi.fn(async () => ({ status: "created", value: record } as const)),
    listDocuments: vi.fn(async () => [record]), getDocument: vi.fn(async () => record),
    appendMessage: vi.fn(async () => ({ status: "created", value: message } as const)),
    listMessages: vi.fn(async () => [message]), appendAuditEvent: vi.fn(async () => "created" as const),
  } satisfies DocumentStore;
  const getContext = vi.fn(async () => ({ session, storeForUser: (id: string) => { expect(id).toBe(owner); return store; } }));
  const deps = { getContext, trustedOrigins: () => ["https://galcoa.test"] };
  return { store, deps, getContext };
}
function post(body: unknown, origin: string | null = "https://galcoa.test") {
  return new Request("https://galcoa.test/api/documents", { method: "POST", headers: {
    "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}),
  }, body: JSON.stringify(body) });
}

describe("HTTP documental real con store doble (no demuestra Postgres)", () => {
  it.each([null, "null", "https://evil.test", "https://galcoa.test.evil.test"])("rechaza Origin %s antes de auth", async (origin) => {
    const { deps, getContext } = setup();
    expect((await createDocumentHttpHandler(deps, "create")(post({}, origin))).status).toBe(403);
    expect(getContext).not.toHaveBeenCalled();
  });
  it("no usa URL/Host del request como autoridad CSRF", async () => {
    const { deps } = setup();
    const request = new Request("https://evil.test/api/documents", { method: "POST", headers: { Origin: "https://evil.test" } });
    expect((await createDocumentHttpHandler(deps, "create")(request)).status).toBe(403);
  });
  it.each([{ status: "anonymous" }, { status: "unavailable" }] as const)("sesión $status sin escrituras", async (session) => {
    const { deps, store } = setup(session);
    const response = await createDocumentHttpHandler(deps, "create")(post({ title: "Título", idempotencyKey: "request_123" }));
    expect(response.status).toBe(session.status === "anonymous" ? 401 : 503);
    expect(store.createDocument).not.toHaveBeenCalled();
  });
  it("crea con usuario verificado; envelope, estado y caché estables", async () => {
    const { deps, store } = setup();
    const response = await createDocumentHttpHandler(deps, "create")(post({ title: "Documento", idempotencyKey: "request_123" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ schemaVersion: 1, outcome: "completed", result: { id: doc }, replayed: false });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(store.createDocument).toHaveBeenCalledWith(expect.objectContaining({ ownerId: owner, audit: expect.objectContaining({ actorScope: owner }) }));
  });
  it("no permite owner/sender/documentId del body", async () => {
    const { deps, store } = setup();
    const handle = createDocumentHttpHandler(deps, "append");
    for (const extra of [{ ownerId: "otro" }, { sender: "agente" }, { documentId: doc }]) {
      expect((await handle(post({ content: "Original", declaredEventDate: { kind: "unknown" }, idempotencyKey: "request_123", ...extra }), doc)).status).toBe(400);
    }
    expect(store.appendMessage).not.toHaveBeenCalled();
  });
  it("guarda original sin recortar y toma id de ruta", async () => {
    const { deps, store } = setup();
    const response = await createDocumentHttpHandler(deps, "append")(post({ content: message.content,
      declaredEventDate: message.declaredEventDate, idempotencyKey: "request_123" }), doc);
    expect(response.status).toBe(200);
    expect(store.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: message.content, documentId: doc, sender: "autor" }));
  });
  it("ajeno/inexistente y UUID inválido: misma respuesta 404", async () => {
    const { deps, store } = setup();
    store.getDocument.mockImplementationOnce(async () => null!);
    const handle = createDocumentHttpHandler(deps, "get");
    expect((await handle(new Request("https://galcoa.test"), doc)).status).toBe(404);
    expect((await handle(new Request("https://galcoa.test"), "invalid")).status).toBe(404);
    expect(store.getDocument).toHaveBeenCalledTimes(1);
  });
  it.each(["list", "get", "messages"] as const)("GET %s solo lee", async (action) => {
    const { deps, store } = setup();
    expect((await createDocumentHttpHandler(deps, action)(new Request("https://galcoa.test"), doc)).status).toBe(200);
    expect(store.createDocument).not.toHaveBeenCalled();
    expect(store.appendMessage).not.toHaveBeenCalled();
  });
  it("limita bytes del body sin confiar en Content-Length", async () => {
    const { deps, store } = setup();
    const response = await createDocumentHttpHandler(deps, "create")(post({ title: "x".repeat(65536) }));
    expect(response.status).toBe(413);
    expect(store.createDocument).not.toHaveBeenCalled();
  });
  it("errores técnicos no filtran datos internos", async () => {
    const { deps } = setup();
    deps.getContext.mockRejectedValueOnce(new Error("secreto SQL"));
    const response = await createDocumentHttpHandler(deps, "list")(new Request("https://galcoa.test"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secreto");
  });
});
