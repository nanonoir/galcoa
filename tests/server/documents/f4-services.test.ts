import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DocumentSummarySchema } from "@/lib/contracts/document";
import { TechnicalErrorSchema } from "@/lib/contracts/technical";
import * as auditModule from "@/lib/documents/audit";
import { appendAuditEvent, AUDIT_EVENT_TYPES, parseAuditEvent } from "@/lib/documents/audit";
import { createDocumentService } from "@/lib/documents/documents";
import { createMessageService, MAX_MESSAGE_CHARS } from "@/lib/documents/messages";
import type { SessionPort } from "@/lib/documents/ports";

import { createMemoryStore } from "./memory-store";

// Usuarios ficticios.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";

function setup() {
  const mem = createMemoryStore();
  let user: string | null = ANA;
  const session: SessionPort = { currentUserId: async () => user };
  return {
    mem,
    docs: createDocumentService(session, mem.store),
    msgs: createMessageService(session, mem.store),
    as: (id: string | null) => {
      user = id;
    },
  };
}

const unknownDate = { kind: "unknown" } as const;

async function newDoc(t: ReturnType<typeof setup>, key = "doc-key-0001") {
  const r = await t.docs.createDocument({ title: "Entrega a Almacén Ficticio", idempotencyKey: key });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe("MVP-040 · documentos del propietario", () => {
  it("crea un documento propio con estados persistidos iniciales y lo audita", async () => {
    const t = setup();
    const doc = await newDoc(t);

    expect(DocumentSummarySchema.parse(doc)).toEqual(doc);
    expect(doc).toMatchObject({
      documentStatus: "borrador",
      controlStatus: "sin_evaluar",
      hcsStatus: "no_iniciado",
      confirmationStatus: null,
      revisionId: null,
      snapshotId: null,
      warnings: [],
    });
    expect(t.mem.inspect().audit).toEqual([
      expect.objectContaining({ type: "document.created", actorScope: ANA, documentId: doc.id, resourceId: doc.id }),
    ]);
  });

  it("lista solo los documentos del usuario y reabre el propio con su estado", async () => {
    const t = setup();
    const a = await newDoc(t);
    t.as(LUIS);
    await newDoc(t, "doc-key-luis1");

    const luisList = await t.docs.listDocuments();
    expect(luisList.ok && luisList.value.map((d) => d.id)).not.toContain(a.id);

    t.as(ANA);
    const anaList = await t.docs.listDocuments();
    expect(anaList.ok && anaList.value.map((d) => d.id)).toEqual([a.id]);
    expect(await t.docs.getDocument(a.id)).toEqual({ ok: true, value: a });
  });

  it("un documento ajeno responde igual que uno inexistente (no revela existencia)", async () => {
    const t = setup();
    const a = await newDoc(t);
    t.as(LUIS);

    const ajeno = await t.docs.getDocument(a.id);
    const inexistente = await t.docs.getDocument("33333333-3333-4333-8333-333333333333");
    expect(ajeno.ok || inexistente.ok).toBe(false);
    if (!ajeno.ok && !inexistente.ok) {
      expect({ ...ajeno.error, correlationId: "x" }).toEqual({ ...inexistente.error, correlationId: "x" });
      expect(ajeno.error.code).toBe("NOT_AVAILABLE");
    }
  });

  it("sin sesión rechaza todas las operaciones sin tocar la base", async () => {
    const t = setup();
    t.as(null);
    for (const r of [
      await t.docs.createDocument({ title: "x", idempotencyKey: "doc-key-0001" }),
      await t.docs.listDocuments(),
      await t.docs.getDocument("cualquiera"),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { code: "NO_SESSION", stage: "autenticacion" } });
    }
    expect(t.mem.inspect().documents).toHaveLength(0);
  });

  it("reintento con la misma clave no duplica; misma clave con otro título es conflicto", async () => {
    const t = setup();
    const first = await t.docs.createDocument({ title: "Entrega", idempotencyKey: "doc-key-0001" });
    const again = await t.docs.createDocument({ title: "Entrega", idempotencyKey: "doc-key-0001" });
    const other = await t.docs.createDocument({ title: "Otra cosa", idempotencyKey: "doc-key-0001" });

    expect(again).toEqual({ ...first, replayed: true });
    expect(other).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(t.mem.inspect().documents).toHaveLength(1);
    expect(t.mem.inspect().audit).toHaveLength(1);
  });

  it("rechaza entradas inválidas y campos que el cliente no puede fijar", async () => {
    const t = setup();
    for (const bad of [
      { title: "   ", idempotencyKey: "doc-key-0001" },
      { title: "x", idempotencyKey: "corta" },
      { title: "x", idempotencyKey: "doc-key-0001", ownerId: LUIS },
      { title: "x", idempotencyKey: "doc-key-0001", documentStatus: "finalizado" },
    ]) {
      expect(await t.docs.createDocument(bad)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
  });

  it("una caída de la base es error técnico reintentable, nunca éxito", async () => {
    const t = setup();
    t.mem.failNextWrite();
    const r = await t.docs.createDocument({ title: "x", idempotencyKey: "doc-key-0001" });
    expect(r).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    if (!r.ok) expect(TechnicalErrorSchema.parse(r.error)).toEqual(r.error);
  });
});

describe("MVP-041 · mensajes persistentes", () => {
  const declared = {
    kind: "declared",
    originalText: "ayer a las 10",
    precision: "datetime",
    timeZone: null,
    instant: null,
  } as const;

  it("conserva el original, el autor, la fecha declarada y la de carga por separado, en orden", async () => {
    const t = setup();
    const doc = await newDoc(t);
    const original = "  Entregamos 10 cajas de yerba.\n¿Está bien?  ";

    const m1 = await t.msgs.recordUserMessage({
      documentId: doc.id, content: original, declaredEventDate: declared, idempotencyKey: "msg-key-0001",
    });
    const m2 = await t.msgs.recordUserMessage({
      documentId: doc.id, content: "Y 2 bolsas de arroz.", declaredEventDate: unknownDate, idempotencyKey: "msg-key-0002",
    });
    expect(m1.ok && m2.ok).toBe(true);

    // «Otra sesión»: nueva lectura.
    const list = await t.msgs.listMessages(doc.id);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.map((m) => m.content)).toEqual([original, "Y 2 bolsas de arroz."]);
    expect(list.value[0]).toMatchObject({ sender: "autor", declaredEventDate: declared });
    // La fecha sin zona no se convierte a UTC ni se completa con la de carga (INV-09).
    expect(list.value[0].declaredEventDate).toEqual(declared);
    expect(list.value[1].declaredEventDate).toEqual({ kind: "unknown" });
    expect(list.value[0].uploadedAt).toMatch(/Z$/);
  });

  it("el cliente no puede fijar la fecha de carga ni el emisor", async () => {
    const t = setup();
    const doc = await newDoc(t);
    for (const extra of [{ uploadedAt: "2020-01-01T00:00:00Z" }, { sender: "agente" }]) {
      const r = await t.msgs.recordUserMessage({
        documentId: doc.id, content: "hola", declaredEventDate: unknownDate, idempotencyKey: "msg-key-0001", ...extra,
      });
      expect(r).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
  });

  it("acepta hasta 8000 caracteres y rechaza más, sin truncar; rechaza vacío", async () => {
    const t = setup();
    const doc = await newDoc(t);
    const base = { documentId: doc.id, declaredEventDate: unknownDate };

    const max = await t.msgs.recordUserMessage({ ...base, content: "a".repeat(MAX_MESSAGE_CHARS), idempotencyKey: "msg-key-0001" });
    const over = await t.msgs.recordUserMessage({ ...base, content: "a".repeat(MAX_MESSAGE_CHARS + 1), idempotencyKey: "msg-key-0002" });
    const empty = await t.msgs.recordUserMessage({ ...base, content: " \n ", idempotencyKey: "msg-key-0003" });

    expect(max.ok && max.value.content.length).toBe(MAX_MESSAGE_CHARS);
    expect(over).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(empty).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(t.mem.inspect().messages).toHaveLength(1);
  });

  it("mismo comando devuelve el mensaje persistido; misma clave con otro texto es conflicto", async () => {
    const t = setup();
    const doc = await newDoc(t);
    const cmd = { documentId: doc.id, content: "10 cajas", declaredEventDate: unknownDate, idempotencyKey: "msg-key-0001" };

    const first = await t.msgs.recordUserMessage(cmd);
    const again = await t.msgs.recordUserMessage(cmd);
    const other = await t.msgs.recordUserMessage({ ...cmd, content: "12 cajas" });

    expect(again).toEqual({ ...first, replayed: true });
    expect(other).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(t.mem.inspect().messages).toHaveLength(1);
    expect(t.mem.inspect().audit.filter((e) => e.type === "message.recorded")).toHaveLength(1);
  });

  it("no permite escribir ni leer mensajes de un documento ajeno", async () => {
    const t = setup();
    const doc = await newDoc(t);
    t.as(LUIS);

    const write = await t.msgs.recordUserMessage({
      documentId: doc.id, content: "intruso", declaredEventDate: unknownDate, idempotencyKey: "msg-key-0001",
    });
    const read = await t.msgs.listMessages(doc.id);
    expect(write).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(read).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(t.mem.inspect().messages).toHaveLength(0);
  });

  it("el puerto del agente (MVP-052) guarda con emisor «agente» y su propia idempotencia", async () => {
    const t = setup();
    const doc = await newDoc(t);
    const cmd = { documentId: doc.id, content: "Borrador listo.", declaredEventDate: unknownDate, idempotencyKey: "msg-key-0001" };

    const user = await t.msgs.recordUserMessage(cmd);
    const agent = await t.msgs.recordAgentMessage(cmd);
    expect(user.ok && user.value.sender).toBe("autor");
    expect(agent.ok && agent.value.sender).toBe("agente");
  });

  it("el servicio no expone edición ni borrado de mensajes", () => {
    const t = setup();
    expect(Object.keys(t.msgs).sort()).toEqual(["listMessages", "recordAgentMessage", "recordUserMessage"]);
  });
});

describe("MVP-044 · auditoría solo-agregar", () => {
  const event = {
    schemaVersion: 1,
    type: "document.created",
    actorScope: ANA,
    documentId: "doc-1",
    resourceType: "document",
    resourceId: "doc-1",
    outcome: "ok",
    correlationId: "corr-1",
  } as const;

  it("catálogo cerrado: documentos, mensajes, evidencias y extracciones", () => {
    expect([...AUDIT_EVENT_TYPES].sort()).toEqual(["document.created", "evidence.accepted", "extraction.recorded", "message.recorded"]);
  });

  it.each([
    ["tipo fuera del catálogo", { ...event, type: "document.deleted" }],
    ["campo de contenido", { ...event, content: "Entregamos 10 cajas" }],
    ["prompt", { ...event, prompt: "Sos un asistente…" }],
    ["sin versión", { ...event, schemaVersion: undefined }],
    ["resultado inválido", { ...event, outcome: "aprobado" }],
  ])("rechaza un evento con %s", (_, bad) => {
    expect(() => parseAuditEvent(bad)).toThrow("Evento de auditoría inválido");
  });

  it("un reintento con la misma clave no duplica el evento", async () => {
    const t = setup();
    const idem = { key: "audit-key-01", fingerprint: "a".repeat(64) };
    expect(await appendAuditEvent(t.mem.store, event, idem)).toBe("created");
    expect(await appendAuditEvent(t.mem.store, event, idem)).toBe("replayed");
    expect(t.mem.inspect().audit).toHaveLength(1);
  });

  it("el módulo no exporta operaciones de actualización ni borrado", () => {
    const names = Object.keys(auditModule).map((n) => n.toLowerCase());
    expect(names.some((n) => /update|delete|remove|edit|purge/.test(n))).toBe(false);
  });
});

describe("Solo servidor (F4)", () => {
  const dir = path.resolve(import.meta.dirname, "../../../src/lib/documents");

  it("cada archivo de src/lib/documents importa server-only y ninguno importa dobles", () => {
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(dir, e.name));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/^import "server-only";/m);
      for (const line of source.split("\n").filter((l) => l.startsWith("import "))) {
        expect(line, file).not.toMatch(/tests\/server|memory-store/);
      }
    }
  });
});

describe("renameDocument (demo P3)", () => {
  it("renombra, recorta, actualiza y audita; mismo título no cambia", async () => {
    const t = setup();
    const created = await t.docs.createDocument({ title: "Original", idempotencyKey: "rename_key_1" });
    if (!created.ok) throw new Error("setup");
    const renamed = await t.docs.renameDocument(created.value.id, { title: "  Nuevo título  " });
    expect(renamed).toMatchObject({ ok: true, value: { id: created.value.id, title: "Nuevo título" } });
    expect(await t.docs.renameDocument(created.value.id, { title: "Nuevo título" })).toMatchObject({ ok: true, value: { title: "Nuevo título" } });
  });
  it.each([{}, { title: " " }, { title: "x".repeat(201) }, { title: "ok", extra: 1 }])("rechaza comando %j", async (command) => {
    const t = setup();
    const created = await t.docs.createDocument({ title: "Original", idempotencyKey: "rename_key_2" });
    if (!created.ok) throw new Error("setup");
    expect(await t.docs.renameDocument(created.value.id, command)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });
  it("documento inexistente: NOT_AVAILABLE", async () => {
    expect(await setup().docs.renameDocument("no-existe", { title: "x" })).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
  });
  it("finalizado: DOCUMENT_FINALIZED; fallo del store: TECHNICAL_FAILURE reintentable", async () => {
    const t = setup();
    const store = {
      renameDocument: async () => ({ status: "finalized" as const }),
    } as never;
    const svc = createDocumentService({ currentUserId: async () => "u1" }, store);
    expect(await svc.renameDocument("d1", { title: "x" })).toMatchObject({ ok: false, error: { code: "DOCUMENT_FINALIZED", retryable: false } });
    const broken = createDocumentService({ currentUserId: async () => "u1" }, { renameDocument: async () => { throw new Error("x"); } } as never);
    expect(await broken.renameDocument("d1", { title: "x" })).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    void t;
  });
});
