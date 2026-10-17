import { describe, expect, it, vi } from "vitest";

import { createDocumentHttpHandler } from "@/lib/documents/http";
import { createDocumentStore } from "@/lib/documents/persistence/store";
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
    renameDocument: vi.fn(async () => ({ status: "updated", value: { ...record, title: "Nuevo" } } as const)),
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

function patch(body: unknown, origin: string | null = "https://galcoa.test", contentType = "application/json") {
  return new Request("https://galcoa.test/api/documents/x", { method: "PATCH", headers: {
    "Content-Type": contentType, ...(origin ? { Origin: origin } : {}),
  }, body: JSON.stringify(body) });
}

describe("HTTP documental real con store doble (no demuestra Postgres)", () => {
  it.each([
    ["42501", 401, "NO_SESSION", false],
    ["22023", 400, "INVALID_INPUT", false],
    ["08006", 503, "TECHNICAL_FAILURE", true],
    ["unknown", 503, "TECHNICAL_FAILURE", true],
  ] as const)("RPC %s: HTTP %s sin filtrar diagnóstico", async (sqlstate, status, code, retryable) => {
    for (const action of ["list", "get", "messages", "create", "append", "rename"] as const) {
      const raw = { code: sqlstate, message: "fake-secret-message", details: "fake-secret-details",
        hint: "fake-secret-hint", stack: "fake-secret-stack" };
      const store = createDocumentStore({ verifiedUserId: owner, session: {
        rpc: async () => ({ data: null, error: raw }),
      } });
      const deps = { getContext: async () => ({ session: authenticated, storeForUser: () => store }),
        trustedOrigins: () => ["https://galcoa.test"] };
      const request = action === "rename" ? patch({ title: "Nuevo" }) : action === "create" ? post({ title: "Documento", idempotencyKey: "request_123" })
        : action === "append" ? post({ content: "Original", declaredEventDate: { kind: "unknown" }, idempotencyKey: "request_123" })
          : new Request("https://galcoa.test");
      const response = await createDocumentHttpHandler(deps, action)(request, doc);
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body).toEqual({ error: { code, retryable, correlationId: expect.any(String),
        stage: code === "NO_SESSION" ? "autenticacion" : code === "INVALID_INPUT" ? "validacion" : "persistencia" } });
      expect(JSON.stringify(body)).not.toContain("fake-secret");
    }
  });
  it("no confía en códigos de excepciones arbitrarias del SDK", async () => {
    const store = createDocumentStore({ verifiedUserId: owner, session: {
      rpc: async () => { throw { code: "NO_SESSION", message: "fake-secret" }; },
    } });
    const response = await createDocumentHttpHandler({
      getContext: async () => ({ session: authenticated, storeForUser: () => store }), trustedOrigins: () => [],
    }, "list")(new Request("https://galcoa.test"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "TECHNICAL_FAILURE", retryable: true } });
  });
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
  describe("PATCH rename", () => {
    it("renombra con usuario verificado y recorta el título", async () => {
      const { deps, store } = setup();
      const response = await createDocumentHttpHandler(deps, "rename")(patch({ title: "  Nuevo  " }), doc);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ schemaVersion: 1, outcome: "completed", result: { id: doc, title: "Nuevo" } });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(store.renameDocument).toHaveBeenCalledWith(expect.objectContaining({
        ownerId: owner, documentId: doc, title: "Nuevo", audit: expect.objectContaining({ actorScope: owner }),
      }));
    });
    it.each([null, "https://evil.test"])("rechaza Origin %s antes de auth", async (origin) => {
      const { deps, getContext } = setup();
      expect((await createDocumentHttpHandler(deps, "rename")(patch({ title: "x" }, origin), doc)).status).toBe(403);
      expect(getContext).not.toHaveBeenCalled();
    });
    it("solo acepta PATCH", async () => {
      const { deps } = setup();
      const response = await createDocumentHttpHandler(deps, "rename")(post({ title: "x" }), doc);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("PATCH");
    });
    it.each([{}, { title: "" }, { title: "   " }, { title: "x".repeat(201) }, { title: "ok", ownerId: "otro" }])("rechaza body %j", async (body) => {
      const { deps, store } = setup();
      expect((await createDocumentHttpHandler(deps, "rename")(patch(body), doc)).status).toBe(400);
      expect(store.renameDocument).not.toHaveBeenCalled();
    });
    it("exige JSON y UUID válido", async () => {
      const { deps, store } = setup();
      const handle = createDocumentHttpHandler(deps, "rename");
      expect((await handle(patch({ title: "x" }, "https://galcoa.test", "text/plain"), doc)).status).toBe(400);
      expect((await handle(patch({ title: "x" }), "invalid")).status).toBe(404);
      expect(store.renameDocument).not.toHaveBeenCalled();
    });
    it("sin sesión no escribe", async () => {
      const { deps, store } = setup({ status: "anonymous" });
      expect((await createDocumentHttpHandler(deps, "rename")(patch({ title: "x" }), doc)).status).toBe(401);
      expect(store.renameDocument).not.toHaveBeenCalled();
    });
    it("ajeno/inexistente: 404; finalizado: 409 DOCUMENT_FINALIZED", async () => {
      const { deps, store } = setup();
      const handle = createDocumentHttpHandler(deps, "rename");
      store.renameDocument.mockResolvedValueOnce({ status: "not_available" } as never);
      expect((await handle(patch({ title: "x" }), doc)).status).toBe(404);
      store.renameDocument.mockResolvedValueOnce({ status: "finalized" } as never);
      const response = await handle(patch({ title: "x" }), doc);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "DOCUMENT_FINALIZED", retryable: false } });
    });
  });
});
