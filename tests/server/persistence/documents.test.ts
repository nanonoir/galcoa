import { describe, expect, it, vi } from "vitest";

import { createDocumentStore } from "@/lib/documents/persistence/store";

const owner = "aaf3163d-8ec5-411d-a7ac-9219f47fb9b1";
const doc = "dc6e5bb1-c726-45bb-a048-97810495992b";
const message = {
  messageId: "93a663a2-12cd-4872-8aa5-d1076e1befa9", documentId: doc, sender: "autor",
  content: " Original sin recortar ", declaredEventDate: { kind: "unknown" }, uploadedAt: "2026-10-16T12:00:00.000000Z",
};
const record = {
  documentId: doc, ownerId: owner, title: "Documento", documentStatus: "borrador", controlStatus: "sin_evaluar",
  confirmationStatus: null, hcsStatus: "no_iniciado", activeRevisionId: null,
  createdAt: "2026-10-16T12:00:00.000000Z", updatedAt: "2026-10-16T12:00:00.000000Z",
};
const idem = { key: "request_123", fingerprint: "a".repeat(64) };
const audit = { actorScope: owner, correlationId: "correlation-123" };

function setup(data: unknown = null, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  const executorRpc = vi.fn(async () => ({ data, error }));
  const store = createDocumentStore({ verifiedUserId: owner, session: { rpc }, executor: { rpc: executorRpc } });
  return { store, rpc, executorRpc };
}

describe("adaptador documental RPC (sin base real)", () => {
  it("crea mediante RPC de sesión sin aceptar actor ni fingerprint de autoridad", async () => {
    const { store, rpc, executorRpc } = setup({ status: "created", value: record });
    expect(await store.createDocument({ ownerId: owner, title: "Documento", idempotency: idem, audit })).toEqual({ status: "created", value: record });
    expect(rpc).toHaveBeenCalledWith("create_document", { p_title: "Documento", p_key: idem.key, p_correlation_id: audit.correlationId });
    expect(executorRpc).not.toHaveBeenCalled();
  });
  it.each(["replayed", "created"])("valida el registro %s", async (status) => {
    const { store } = setup({ status, value: { ...record, ownerId: "otro" } });
    await expect(store.createDocument({ ownerId: owner, title: "Documento", idempotency: idem, audit })).rejects.toThrow();
  });
  it("rechaza actor divergente antes de consultar", async () => {
    const { store, rpc } = setup([]);
    await expect(store.listDocuments("otro")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("renombra por RPC de sesión validando identidad y documento", async () => {
    const renamed = { ...record, title: "Nuevo" };
    const { store, rpc, executorRpc } = setup({ status: "updated", value: renamed });
    expect(await store.renameDocument({ ownerId: owner, documentId: doc, title: "Nuevo", audit })).toEqual({ status: "updated", value: renamed });
    expect(rpc).toHaveBeenCalledWith("rename_document", { p_document_id: doc, p_title: "Nuevo", p_correlation_id: audit.correlationId });
    expect(executorRpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { status: "finalized" }, error: null });
    expect(await store.renameDocument({ ownerId: owner, documentId: doc, title: "Nuevo", audit })).toEqual({ status: "finalized" });
    rpc.mockResolvedValueOnce({ data: { status: "unchanged", value: { ...renamed, documentId: "otro" } }, error: null });
    await expect(store.renameDocument({ ownerId: owner, documentId: doc, title: "Nuevo", audit })).rejects.toThrow();
    await expect(store.renameDocument({ ownerId: "otro", documentId: doc, title: "Nuevo", audit })).rejects.toThrow();
  });
  it("lista/reabre con identidad y contrato validados", async () => {
    const { store, rpc } = setup([record]);
    expect(await store.listDocuments(owner)).toEqual([record]);
    rpc.mockResolvedValueOnce({ data: record, error: null });
    expect(await store.getDocument(owner, doc)).toEqual(record);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await store.getDocument(owner, doc)).toBeNull();
  });
  it("no acepta un documento distinto al solicitado", async () => {
    await expect(setup(record).store.getDocument(owner, "otro")).rejects.toThrow();
  });
  it("conserva el original y envía fecha declarada separada", async () => {
    const { store, rpc } = setup({ status: "replayed", value: message });
    await store.appendMessage({ ownerId: owner, documentId: doc, sender: "autor", content: message.content,
      declaredEventDate: { kind: "unknown" }, idempotency: idem, audit });
    expect(rpc).toHaveBeenCalledWith("append_message", { p_document_id: doc, p_content: message.content,
      p_declared_event_date: { kind: "unknown" }, p_key: idem.key, p_correlation_id: audit.correlationId });
  });
  it("agente solo usa el canal ejecutor, nunca la sesión", async () => {
    const { store, rpc, executorRpc } = setup({ status: "created", value: { ...message, sender: "agente" } });
    await store.appendMessage({ ownerId: owner, documentId: doc, sender: "agente", content: message.content,
      declaredEventDate: { kind: "unknown" }, idempotency: idem, audit });
    expect(rpc).not.toHaveBeenCalled();
    expect(executorRpc).toHaveBeenCalledWith("append_agent_message", expect.objectContaining({ p_actor_id: owner }));
  });
  it("sin ejecutor falla cerrado y no sustituye por service_role", async () => {
    const rpc = vi.fn();
    const store = createDocumentStore({ verifiedUserId: owner, session: { rpc } });
    await expect(store.appendMessage({ ownerId: owner, documentId: doc, sender: "agente", content: "respuesta",
      declaredEventDate: { kind: "unknown" }, idempotency: idem, audit })).rejects.toThrow("ejecutor");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["idempotency_conflict", "not_available"])("propaga %s", async (status) => {
    const { store } = setup({ status });
    expect(await store.createDocument({ ownerId: owner, title: "Documento", idempotency: idem, audit })).toEqual({ status });
  });
  it("mensajes ajenos/inexistentes = null; no reordena secuencia recibida", async () => {
    const { store, rpc } = setup(null);
    expect(await store.listMessages(owner, doc)).toBeNull();
    rpc.mockResolvedValueOnce({ data: [message, { ...message, messageId: "siguiente" }], error: null });
    expect((await store.listMessages(owner, doc))?.map((m) => m.messageId)).toEqual([message.messageId, "siguiente"]);
  });
  it("rechaza respuesta de mensajes de otro documento", async () => {
    await expect(setup([{ ...message, documentId: "otro" }]).store.listMessages(owner, doc)).rejects.toThrow();
  });
  it("no filtra errores SQL", async () => {
    await expect(setup(null, { message: "SQL privado" }).store.listDocuments(owner)).rejects.toThrow("Persistencia no disponible");
  });
  it("auditoría interna sin contenido y con actor verificado", async () => {
    const { store, rpc, executorRpc } = setup("created");
    expect(await store.appendAuditEvent({ schemaVersion: 1, type: "document.created", actorScope: owner,
      documentId: doc, resourceType: "document", resourceId: doc, outcome: "ok", correlationId: audit.correlationId }, idem)).toBe("created");
    expect(rpc).not.toHaveBeenCalled();
    expect(executorRpc).toHaveBeenCalledWith("append_document_audit", {
      p_actor_id: owner, p_document_id: doc, p_type: "document.created", p_resource_id: doc,
      p_outcome: "ok", p_correlation_id: audit.correlationId, p_key: idem.key,
    });
  });
});
