import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildReceipts } from "@/lib/documents/finalization/receipts";
import { renderFinalPdf, renderPreviewPdf } from "@/lib/documents/pdf/render";
import { verifyUrlFor } from "@/lib/documents/pdf/verify-url";

import { fakeEvaluation } from "../revisions/alc-double";

// Datos ficticios.
const SNAP = "736a8da7c6c9257c313c1580dbc42dc88c17b3db4de868a24f41d255fbefe804";
const operation = { title: "Acuerdo ficticio de entrega", body: "Se entregan 12 cajas de ejemplo.", corrections: [] };
const responses = [
  { responseId: "c-1", role: "autor" as const, decision: "confirmar" as const, declaredName: null, respondedAt: "2026-10-16T12:00:00.000Z" },
  { responseId: "c-2", role: "intermediario" as const, decision: "confirmar" as const, declaredName: "Luis Gomez", respondedAt: "2026-10-16T12:01:00.000Z" },
  { responseId: "c-3", role: "comprador" as const, decision: "confirmar" as const, declaredName: "Juan Perez", respondedAt: "2026-10-16T12:02:00.000Z" },
];

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  // Se corta cada flujo por su `/Length`: buscar el `endstream` falla si los bytes comprimidos terminan en `\r`.
  for (const m of raw.matchAll(/\/Length (\d+)\b[\s\S]*?>>\s*stream\r?\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const data = raw.slice(start, start + Number(m[1]));
    try {
      out.push(inflateSync(Buffer.from(data, "latin1")).toString("latin1"));
    } catch {
      out.push(data);
    }
  }
  const lines: string[] = [];
  for (const m of out.join("\n").matchAll(/\[(.*?)\]\s*TJ/g)) {
    lines.push([...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join(""));
  }
  return lines.join("\n");
}

const selection = ["autor", "intermediario", "comprador"] as ["autor", "intermediario", "comprador"];
const evaluation = fakeEvaluation("amarillo", [...selection]);
const content = { operation, warnings: [], selection, alc: evaluation.shared, rectifications: [] };
const input = () => ({
  content,
  receipts: buildReceipts([...selection], responses),
  revisionId: "r-fixture",
  snapshotHash: SNAP,
  publicReference: "000102030405060708090a0b0c0d0e0f",
  finalizedAt: "2026-10-16T12:05:00.000Z",
});

describe("PDF final v2 y vista previa (F-5)", () => {
  it("rotula proveedor/transportista/comprador y muestra el semáforo, sin lenguaje de certificación", async () => {
    const text = pdfText((await renderFinalPdf(input())).bytes);
    for (const phrase of ["Proveedor", "Transportista", "Comprador", "AMARILLO", "declarado", "no verifica"]) {
      expect(text, phrase).toContain(phrase);
    }
    for (const banned of ["certificad", "firma digital", "identidad verificada", "garantizado", "validado regulatoriamente"]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  }, 30_000);

  it("la vista previa es otro documento: marcada, sin semáforo ni constancias y sin huella de snapshot", async () => {
    const preview = await renderPreviewPdf(operation);
    const final = await renderFinalPdf(input());
    const text = pdfText(preview);
    expect(text).toContain("Vista previa");
    expect(text).not.toContain("Constancias");
    expect(text).not.toContain("AMARILLO");
    expect(createHash("sha256").update(preview).digest("hex")).not.toBe(final.sha256);
    expect(Buffer.from(preview).toString("latin1")).not.toContain(SNAP.slice(0, 16));
  }, 30_000);
  it("encabezado, tabla de datos y pie con QR y enlace al verificador", async () => {
    const url = "https://app.ejemplo.test/verify/000102030405060708090a0b0c0d0e0f";
    const text = pdfText((await renderFinalPdf({ ...input(), verifyUrl: url })).bytes);
    for (const phrase of ["DOCUMENTO VERIFICABLE", "Finalizado el 16/10/2026 a las 12:05 (UTC)", "Producto", "Unidad", "Estado", "Datos t", "Comprob", url]) {
      expect(text, phrase).toContain(phrase);
    }
    const withoutUrl = pdfText((await renderFinalPdf(input())).bytes);
    expect(withoutUrl).toContain("000102030405060708090a0b0c0d0e0f");
    expect(withoutUrl).not.toContain("Comprob");
  }, 30_000);

  it("el mismo snapshot da siempre los mismos bytes, también con QR", async () => {
    const url = "https://app.ejemplo.test/verify/000102030405060708090a0b0c0d0e0f";
    const a = await renderFinalPdf({ ...input(), verifyUrl: url });
    const b = await renderFinalPdf({ ...input(), verifyUrl: url });
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe((await renderFinalPdf(input())).sha256);
  }, 30_000);

  it("el enlace del verificador sale del origen canónico y, sin configuración, no hay QR", () => {
    const env = (value: string | undefined) => (name: string) => (name === "NEXT_PUBLIC_APP_URL" ? value : undefined);
    expect(verifyUrlFor("abc123", env("https://app.ejemplo.test/, https://otro.test"))).toBe("https://app.ejemplo.test/verify/abc123");
    expect(verifyUrlFor("abc123", env(undefined))).toBeNull();
    expect(verifyUrlFor("abc123", env("no es una url"))).toBeNull();
  });
});
