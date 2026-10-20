import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createFinalPdfDownloadHandler, type PdfDownloadContext } from "@/lib/documents/finalization/pdf-download";

// Datos ficticios. Dobles de cliente: no ejercen RLS real (sin Docker); modelan lo que la RLS devolvería a un propietario o a un ajeno.
const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const PATH = `${DOC}/v1/final.pdf`;
const PDF = new TextEncoder().encode("%PDF-1.7 contenido ficticio inmutable");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

type Rows = { version?: unknown; artifact?: unknown; versionError?: unknown; artifactError?: unknown };
type Download = { data: Blob | null; error: unknown };

function context(rows: Rows, download: Download, session: unknown = { status: "authenticated", user: { id: USER, email: null } }) {
  const calls = { tables: [] as string[], downloads: [] as string[] };
  const query = (data: unknown, error: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data, error: error ?? null });
    return q;
  };
  const client = {
    from: (table: string) => {
      calls.tables.push(table);
      return table === "document_versions" ? query(rows.version, rows.versionError) : query(rows.artifact, rows.artifactError);
    },
    storage: { from: (bucket: string) => ({ download: async (path: string) => { calls.downloads.push(`${bucket}:${path}`); return download; } }) },
  };
  const ctx = { session, client } as unknown as PdfDownloadContext;
  return { handler: createFinalPdfDownloadHandler({ getContext: async () => ctx }), calls };
}

const version = { id: VERSION_ID, public_reference: "b3357344164340c5b1c72712adaa97a3" };
const artifact = (bytes: Uint8Array = PDF) => ({ object_path: PATH, sha256: sha(bytes), byte_length: bytes.byteLength });
const blob = (bytes: Uint8Array) => ({ data: new Blob([bytes as BlobPart]), error: null });
const get = (method = "GET") => new Request("http://localhost:3000/x", { method });

describe("descarga autenticada del PDF final", () => {
  it("sirve exactamente los bytes almacenados con cabeceras privadas y de descarga", async () => {
    const { handler, calls } = context({ version, artifact: artifact() }, blob(PDF));
    const res = await handler(get(), DOC, "1");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="galcoa-${version.public_reference}-v1.pdf"`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toMatch(/private, no-store/);
    expect(res.headers.get("Content-Length")).toBe(String(PDF.byteLength));
    expect(calls.downloads).toEqual([`versions-private:${PATH}`]);
  });

  it("anónimo: 401 sin consultar datos; sesión no verificable: 503", async () => {
    const anon = context({ version, artifact: artifact() }, blob(PDF), { status: "anonymous" });
    expect((await anon.handler(get(), DOC, "1")).status).toBe(401);
    expect(anon.calls.tables).toEqual([]);
    const down = context({ version, artifact: artifact() }, blob(PDF), { status: "unavailable" });
    expect((await down.handler(get(), DOC, "1")).status).toBe(503);
    expect(down.calls.downloads).toEqual([]);
  });

  it("no propietario (RLS no devuelve filas): 404 indistinguible de una versión inexistente, sin tocar storage", async () => {
    const foreign = context({ version: null }, blob(PDF));
    const missing = context({ version: null, artifact: null }, blob(PDF));
    const a = await foreign.handler(get(), DOC, "1");
    const b = await missing.handler(get(), DOC, "7");
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await a.json()).toEqual(await b.json());
    expect(foreign.calls.downloads).toEqual([]);
  });

  it("ids o número de versión inválidos: 404 sin consultar", async () => {
    const { handler, calls } = context({ version, artifact: artifact() }, blob(PDF));
    for (const [doc, n] of [["x", "1"], [DOC, "0"], [DOC, "-1"], [DOC, "1.5"], [DOC, "abc"], [DOC, "01"]] as const) {
      expect((await handler(get(), doc, n)).status).toBe(404);
    }
    expect(calls.tables).toEqual([]);
  });

  it("artefacto ausente (fila o objeto): 404; error de storage o de lectura: 503 opaco", async () => {
    expect((await context({ version, artifact: null }, blob(PDF)).handler(get(), DOC, "1")).status).toBe(404);
    const noObject = { data: null, error: { statusCode: "404", message: "secret" } };
    expect((await context({ version, artifact: artifact() }, noObject).handler(get(), DOC, "1")).status).toBe(404);
    const broken = { data: null, error: { statusCode: "500", message: "secret storage" } };
    const res = await context({ version, artifact: artifact() }, broken).handler(get(), DOC, "1");
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
    const dbDown = await context({ version, versionError: { message: "secret sql" } }, blob(PDF)).handler(get(), DOC, "1");
    expect(dbDown.status).toBe(503);
    expect(JSON.stringify(await dbDown.json())).not.toMatch(/secret/);
  });

  it("bytes que no coinciden con hash o longitud registrados: no se entregan", async () => {
    const tampered = new TextEncoder().encode("%PDF-1.7 contenido ALTERADO inmutable");
    const res = await context({ version, artifact: artifact() }, blob(tampered)).handler(get(), DOC, "1");
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).not.toBe("application/pdf");
    const short = await context({ version, artifact: artifact() }, blob(PDF.slice(0, 5))).handler(get(), DOC, "1");
    expect(short.status).toBe(500);
  });

  it("HEAD autenticado: mismas cabeceras que GET y cero bytes de cuerpo", async () => {
    const { handler, calls } = context({ version, artifact: artifact() }, blob(PDF));
    const getRes = await handler(get(), DOC, "1");
    const headRes = await handler(get("HEAD"), DOC, "1");
    expect(headRes.status).toBe(200);
    expect((await headRes.arrayBuffer()).byteLength).toBe(0);
    for (const name of ["Content-Type", "Content-Length", "Content-Disposition", "Cache-Control", "X-Content-Type-Options"]) {
      expect(headRes.headers.get(name)).toBe(getRes.headers.get(name));
    }
    expect(calls.downloads).toHaveLength(2);
  });

  it("HEAD respeta el aislamiento: anónimo 401, ajeno 404 y bytes alterados 500, sin cuerpo con PDF", async () => {
    const anon = await context({ version, artifact: artifact() }, blob(PDF), { status: "anonymous" }).handler(get("HEAD"), DOC, "1");
    expect(anon.status).toBe(401);
    const foreign = context({ version: null }, blob(PDF));
    expect((await foreign.handler(get("HEAD"), DOC, "1")).status).toBe(404);
    expect(foreign.calls.downloads).toEqual([]);
    const tampered = new TextEncoder().encode("%PDF-1.7 contenido ALTERADO inmutable");
    const bad = await context({ version, artifact: artifact() }, blob(tampered)).handler(get("HEAD"), DOC, "1");
    expect(bad.status).toBe(500);
    expect(bad.headers.get("Content-Type")).not.toBe("application/pdf");
  });

  it("solo GET y HEAD; las respuestas de error también son privadas", async () => {
    const { handler } = context({ version, artifact: artifact() }, blob(PDF));
    const post = await handler(get("POST"), DOC, "1");
    expect([post.status, post.headers.get("Allow")]).toEqual([405, "GET, HEAD"]);
    const miss = await context({ version: null }, blob(PDF)).handler(get(), DOC, "1");
    expect(miss.headers.get("Cache-Control")).toMatch(/private, no-store/);
    expect(miss.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
