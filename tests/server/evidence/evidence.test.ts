import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EVIDENCE_LIMITS, inspectEvidence } from "@/lib/documents/evidence/inspect";
import { createEvidenceService, UPLOAD_PERMIT_SECONDS } from "@/lib/documents/evidence/service";
import type { SessionPort } from "@/lib/documents/ports";

import { createEvidenceDoubles, jpegBytes, pdfBytes, pngBytes, sha256 } from "./memory";

// Datos ficticios; ni Supabase ni Storage reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_LUIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setup(user: string | null = ANA) {
  const doubles = createEvidenceDoubles({ documents: { [DOC]: ANA, [DOC_LUIS]: LUIS } });
  const session: SessionPort = { currentUserId: async () => user };
  let n = 0;
  const service = createEvidenceService({
    session,
    store: doubles.store,
    storage: doubles.storage,
    newObjectId: () => `obj-${++n}`,
    newCorrelationId: () => "corr-1",
  });
  return { ...doubles, service };
}

let keySeq = 0;
const command = (bytes: Uint8Array, mimeType: string, over: Record<string, unknown> = {}) => ({
  documentId: DOC,
  mimeType,
  byteLength: bytes.byteLength,
  sha256: sha256(bytes),
  declaredEventDate: { kind: "unknown" },
  idempotencyKey: `clave-${++keySeq}-abcdef`,
  ...over,
});

/** Reserva, sube y completa. */
async function uploadFlow(ctx: ReturnType<typeof setup>, bytes: Uint8Array, mimeType: string, over: Record<string, unknown> = {}, uploaded = bytes) {
  const reserved = await ctx.service.requestUpload(command(bytes, mimeType, over));
  if (!reserved.ok) return reserved;
  const location = ctx.evidences.get(reserved.value.evidence.evidenceId)!.privateLocation;
  ctx.upload(location, uploaded);
  return ctx.service.completeUpload({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId });
}

describe("Inspección por contenido (MVP-042)", () => {
  it.each([
    ["PDF de 2 páginas", pdfBytes(2), "application/pdf", { ok: true, kind: "pdf", pages: 2 }],
    ["PNG 1000×800", pngBytes(1000, 800), "image/png", { ok: true, kind: "imagen", pixels: 800_000 }],
    ["JPEG 4000×3000", jpegBytes(4000, 3000), "image/jpeg", { ok: true, kind: "imagen", pixels: 12_000_000 }],
    ["PDF de 11 páginas", pdfBytes(11), "application/pdf", { ok: false, code: "EVIDENCE_PDF_TOO_MANY_PAGES" }],
    ["PDF con contraseña", pdfBytes(1, { encrypted: true }), "application/pdf", { ok: false, code: "EVIDENCE_PDF_ENCRYPTED" }],
    ["PDF cortado", pdfBytes(1, { eof: false }), "application/pdf", { ok: false, code: "EVIDENCE_CORRUPT" }],
    ["PNG de más de 20 MP", pngBytes(5000, 4001), "image/png", { ok: false, code: "EVIDENCE_IMAGE_TOO_LARGE" }],
    ["PNG declarado como JPEG", pngBytes(10, 10), "image/jpeg", { ok: false, code: "EVIDENCE_TYPE_MISMATCH" }],
    ["texto con extensión .pdf", new TextEncoder().encode("hola"), "application/pdf", { ok: false, code: "EVIDENCE_UNSUPPORTED_TYPE" }],
    ["JPEG sin dimensiones", new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]), "image/jpeg", { ok: false, code: "EVIDENCE_CORRUPT" }],
  ] as const)("%s", (_, bytes, declared, expected) => {
    expect(inspectEvidence(bytes, declared)).toMatchObject(expected);
  });

  it("acepta exactamente 20 MP y 10 páginas", () => {
    expect(inspectEvidence(pngBytes(5000, 4000), "image/png").ok).toBe(true);
    expect(inspectEvidence(pdfBytes(10), "application/pdf").ok).toBe(true);
  });

  it("rechaza más de 10 MiB sin leer el resto", () => {
    const big = new Uint8Array(EVIDENCE_LIMITS.maxFileBytes + 1);
    big.set(pdfBytes(1));
    expect(inspectEvidence(big, "application/pdf")).toEqual({ ok: false, code: "EVIDENCE_TOO_LARGE" });
  });
});

describe("Carga privada en dos pasos (MVP-042)", () => {
  it("emite un permiso breve a una ruta opaca y acepta el original con su hash", async () => {
    const ctx = setup();
    const bytes = pdfBytes(3);
    const reserved = await ctx.service.requestUpload(command(bytes, "application/pdf"));
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.value.upload).not.toBeNull();
    expect(ctx.signedUploads).toEqual([{ location: `${DOC}/obj-1`, maxBytes: bytes.byteLength, expiresInSeconds: UPLOAD_PERMIT_SECONDS }]);
    expect(JSON.stringify(reserved.value.evidence)).not.toContain("obj-1");

    ctx.upload(`${DOC}/obj-1`, bytes);
    const done = await ctx.service.completeUpload({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId });
    expect(done).toMatchObject({ ok: true, value: { uploadState: "accepted", sha256: sha256(bytes), kind: "pdf", byteLength: bytes.byteLength } });
    expect(ctx.audit).toEqual([{ type: "evidence.accepted", evidenceId: reserved.value.evidence.evidenceId, correlationId: "corr-1" }]);
  });

  it("guarda la fecha declarada aparte de la fecha de carga del servidor (INV-09)", async () => {
    const ctx = setup();
    const declared = { kind: "declared", originalText: "5/10", precision: "day", timeZone: null, instant: null };
    const done = await uploadFlow(ctx, pngBytes(10, 10), "image/png", { declaredEventDate: declared });
    expect(done).toMatchObject({ ok: true, value: { declaredEventDate: declared } });
    if (done.ok) expect(done.value.uploadedAt).toMatch(/^2026-10-16T15:00/);
  });

  it.each([
    ["tipo no admitido", { mimeType: "text/plain" }, "EVIDENCE_UNSUPPORTED_TYPE"],
    ["más de 10 MiB", { byteLength: EVIDENCE_LIMITS.maxFileBytes + 1 }, "EVIDENCE_TOO_LARGE"],
    ["hash mal formado", { sha256: "abc" }, "INVALID_INPUT"],
    ["clave de idempotencia inválida", { idempotencyKey: "x" }, "INVALID_INPUT"],
  ])("rechaza al reservar con %s, sin permiso de subida", async (_, over, code) => {
    const ctx = setup();
    const result = await ctx.service.requestUpload(command(pdfBytes(1), "application/pdf", over));
    expect(result).toMatchObject({ ok: false, error: { code, stage: "validacion" } });
    expect(ctx.signedUploads).toHaveLength(0);
  });

  it.each([
    ["contenido distinto del declarado", pngBytes(10, 10), "application/pdf", pngBytes(10, 10), "EVIDENCE_TYPE_MISMATCH"],
    ["PDF con contraseña", pdfBytes(1, { encrypted: true }), "application/pdf", null, "EVIDENCE_PDF_ENCRYPTED"],
    ["PDF de 11 páginas", pdfBytes(11), "application/pdf", null, "EVIDENCE_PDF_TOO_MANY_PAGES"],
    ["imagen de más de 20 MP", jpegBytes(6000, 4000), "image/jpeg", null, "EVIDENCE_IMAGE_TOO_LARGE"],
    ["bytes distintos de los declarados (mismo tamaño)", pdfBytes(2), "application/pdf", "swap", "EVIDENCE_HASH_MISMATCH"],
    ["tamaño distinto del declarado", pdfBytes(1), "application/pdf", pdfBytes(2), "EVIDENCE_SIZE_MISMATCH"],
  ] as const)("revalida tras la subida: %s → borra el objeto y libera el cupo", async (_, declaredBytes, mime, uploadedRaw, code) => {
    const ctx = setup();
    const uploaded: Uint8Array = uploadedRaw === null ? declaredBytes : uploadedRaw === "swap" ? declaredBytes.slice() : uploadedRaw;
    if (uploadedRaw === "swap") uploaded[20] ^= 0x01;
    const result = await uploadFlow(ctx, declaredBytes, mime, {}, uploaded);
    expect(result).toMatchObject({ ok: false, error: { code, stage: "validacion", retryable: false } });
    expect(ctx.removed).toEqual([`${DOC}/obj-1`]);
    expect(ctx.objects.size).toBe(0);
    expect(ctx.evidences.size).toBe(0);
    expect(ctx.audit).toHaveLength(0);
  });

  it("sin objeto subido todavía: error reintentable y la reserva sigue", async () => {
    const ctx = setup();
    const reserved = await ctx.service.requestUpload(command(pdfBytes(1), "application/pdf"));
    if (!reserved.ok) throw new Error("reserva");
    const result = await ctx.service.completeUpload({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId });
    expect(result).toMatchObject({ ok: false, error: { code: "EVIDENCE_NOT_UPLOADED", retryable: true } });
    expect(ctx.evidences.size).toBe(1);
  });

  it("topes acumulados por documento: 3 archivos y 20 MiB, también con cargas simultáneas", async () => {
    const ctx = setup();
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => ctx.service.requestUpload(command(pdfBytes(i), "application/pdf"))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: { code: "EVIDENCE_LIMIT_FILES" } });

    const ctx2 = setup();
    const nine = 9 * 1_048_576;
    const fake = (i: number) => command(pdfBytes(1), "application/pdf", { byteLength: nine, sha256: String(i).repeat(64) });
    const [a, b, c] = await Promise.all([1, 2, 3].map((i) => ctx2.service.requestUpload(fake(i))));
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect(c).toMatchObject({ ok: false, error: { code: "EVIDENCE_LIMIT_TOTAL" } });
  });

  it("un rechazo libera el cupo para otra carga", async () => {
    const ctx = setup();
    await uploadFlow(ctx, pdfBytes(1), "application/pdf");
    await uploadFlow(ctx, pdfBytes(2), "application/pdf");
    expect(await uploadFlow(ctx, pdfBytes(11), "application/pdf")).toMatchObject({ ok: false });
    expect(await uploadFlow(ctx, pdfBytes(3), "application/pdf")).toMatchObject({ ok: true });
  });

  it("idempotencia: mismo comando, mismo registro; misma clave con otros bytes, conflicto", async () => {
    const ctx = setup();
    const bytes = pdfBytes(1);
    const cmd = command(bytes, "application/pdf");
    const first = await ctx.service.requestUpload(cmd);
    const again = await ctx.service.requestUpload(cmd);
    expect(again).toMatchObject({ ok: true, replayed: true });
    if (first.ok && again.ok) expect(again.value.evidence.evidenceId).toBe(first.value.evidence.evidenceId);

    if (!first.ok) return;
    ctx.upload(`${DOC}/obj-1`, bytes);
    await ctx.service.completeUpload({ documentId: DOC, evidenceId: first.value.evidence.evidenceId });
    const afterAccept = await ctx.service.requestUpload(cmd);
    expect(afterAccept).toMatchObject({ ok: true, replayed: true, value: { upload: null, evidence: { uploadState: "accepted" } } });

    const other = await ctx.service.requestUpload({ ...cmd, sha256: sha256(pdfBytes(2)) });
    expect(other).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(ctx.evidences.size).toBe(1);
  });

  it("completar dos veces no duplica ni re-audita", async () => {
    const ctx = setup();
    const done = await uploadFlow(ctx, pdfBytes(1), "application/pdf");
    if (!done.ok) throw new Error("carga");
    const again = await ctx.service.completeUpload({ documentId: DOC, evidenceId: done.value.evidenceId });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(ctx.audit).toHaveLength(1);
  });

  it("documento ajeno o sin sesión: denegado sin revelar existencia", async () => {
    const ana = setup();
    expect(await ana.service.requestUpload(command(pdfBytes(1), "application/pdf", { documentId: DOC_LUIS }))).toMatchObject({
      ok: false,
      error: { code: "NOT_AVAILABLE" },
    });
    expect(await setup(null).service.requestUpload(command(pdfBytes(1), "application/pdf"))).toMatchObject({
      ok: false,
      error: { code: "NO_SESSION", stage: "autenticacion" },
    });

    const done = await uploadFlow(ana, pdfBytes(1), "application/pdf");
    if (!done.ok) throw new Error("carga");
    const luis = createEvidenceService({ session: { currentUserId: async () => LUIS }, store: ana.store, storage: ana.storage });
    for (const r of [
      await luis.completeUpload({ documentId: DOC, evidenceId: done.value.evidenceId }),
      await luis.readOriginal({ documentId: DOC, evidenceId: done.value.evidenceId }),
      await luis.listEvidences(DOC),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    }
  });

  it("lectura del original: URL firmada breve, solo de originales aceptados y sin ruta en el listado", async () => {
    const ctx = setup();
    const done = await uploadFlow(ctx, pdfBytes(1), "application/pdf");
    if (!done.ok) throw new Error("carga");
    expect(await ctx.service.readOriginal({ documentId: DOC, evidenceId: done.value.evidenceId })).toMatchObject({
      ok: true,
      value: { url: expect.stringContaining("ttl=60") },
    });
    const reserved = await ctx.service.requestUpload(command(pdfBytes(2), "application/pdf"));
    if (!reserved.ok) throw new Error("reserva");
    expect(await ctx.service.readOriginal({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId })).toMatchObject({ ok: false });

    const list = await ctx.service.listEvidences(DOC);
    expect(list).toMatchObject({ ok: true, value: [{ evidenceId: done.value.evidenceId }] });
    expect(JSON.stringify(list)).not.toContain(`${DOC}/obj`);
  });

  it("fallos técnicos: Storage o base caída no dejan un original a medias ni lo borran", async () => {
    const ctx = setup();
    ctx.fail.signedUpload = true;
    expect(await ctx.service.requestUpload(command(pdfBytes(1), "application/pdf"))).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE", retryable: true },
    });
    ctx.fail.signedUpload = false;

    const bytes = pdfBytes(2);
    const reserved = await ctx.service.requestUpload(command(bytes, "application/pdf"));
    if (!reserved.ok) throw new Error("reserva");
    const location = ctx.evidences.get(reserved.value.evidence.evidenceId)!.privateLocation;
    ctx.upload(location, bytes);
    ctx.fail.accept = true;
    expect(await ctx.service.completeUpload({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId })).toMatchObject({
      ok: false,
      error: { code: "TECHNICAL_FAILURE", retryable: true },
    });
    expect(ctx.objects.get(location)).toEqual(bytes);
    expect(ctx.removed).toHaveLength(0);

    ctx.fail.accept = false;
    expect(await ctx.service.completeUpload({ documentId: DOC, evidenceId: reserved.value.evidence.evidenceId })).toMatchObject({
      ok: true,
      value: { uploadState: "accepted" },
    });
  });
});

describe("Aislamiento del módulo (MVP-042)", () => {
  it("el código de evidencias no importa Supabase, proveedores de IA ni dobles", () => {
    const dir = path.resolve(import.meta.dirname, "../../../src/lib/documents/evidence");
    for (const file of readdirSync(dir)) {
      const imports = readFileSync(path.join(dir, file), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.startsWith("import "));
      expect(imports[0], file).toBe('import "server-only";');
      for (const line of imports) expect(line, file).not.toMatch(/supabase|@ai-sdk|groq-sdk|lib\/ai|tests\//);
    }
  });
});
