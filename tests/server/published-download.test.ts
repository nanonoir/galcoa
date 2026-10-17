import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createPublishedDownloadHandler } from "@/lib/documents/published-download";

const id = "10000000-0000-4000-8000-000000000001";
const bytes = new Uint8Array([37, 80, 68, 70, 45, 0, 255]);
function fixture(user = "A", published = true, storageMissing = false) {
  const selects: string[] = [];
  const filters: unknown[] = [];
  const download = vi.fn(async () => ({ data: storageMissing ? null : new Blob([bytes]), error: null }));
  const from = vi.fn((table: string) => {
    const chain = {
      select: (columns: string) => { selects.push(columns); return chain; },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
      maybeSingle: async () => ({ data: user !== "A" || !published ? null : table === "document_versions"
        ? { id: "version", version_number: 7, public_reference: "reference" }
        : { bucket: "versions-private", object_path: "opaque/pdf" }, error: null }),
    };
    return chain;
  });
  const client = { auth: { getUser: async () => ({ data: { user: user === "anon" ? null : { id: user } }, error: null }) },
    from, storage: { from: () => ({ download }) } } as unknown as SupabaseClient;
  return { handle: createPublishedDownloadHandler(async () => client), from, download, selects, filters };
}
describe("Descarga publicada con dobles RLS/Storage", () => {
  it("transmite bytes idénticos con cabeceras privadas y nombre seguro", async () => {
    const f = fixture();
    const r = await f.handle(id, "7", true);
    expect(r.status).toBe(200);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toContain("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="galcoa-version-7.pdf"');
    expect(f.download).toHaveBeenCalledWith("opaque/pdf");
    expect(f.filters).toContainEqual(["document_id", id]);
    expect(f.filters).toContainEqual(["version_number", 7]);
    expect(f.filters).toContainEqual(["kind", "pdf"]);
    expect(f.selects).toEqual(["id, version_number, public_reference", "bucket, object_path"]);
  });
  it("proyecta solamente referencia pública y número", async () => {
    const f = fixture();
    expect(await (await f.handle(id, "7", false)).json()).toEqual({ versionNumber: 7, publicReference: "reference" });
    expect(f.download).not.toHaveBeenCalled();
  });
  it.each([false, true])("B/anon no acceden (download=%s)", async (download) => {
    const b = fixture("B");
    const denied = await b.handle(id, "7", download);
    const missing = await fixture("A", false).handle(id, "7", download);
    expect(denied.status).toBe(404);
    expect(await denied.text()).toBe(await missing.text());
    expect(b.download).not.toHaveBeenCalled();
    const anon = fixture("anon");
    expect((await anon.handle(id, "7", download)).status).toBe(401);
    expect(anon.from).not.toHaveBeenCalled();
  });
  it("objeto ausente no se reconstruye", async () => {
    expect((await fixture("A", true, true).handle(id, "7", true)).status).toBe(404);
  });
  it.each(["0", "-1", "1\r\ninjected", "9007199254740992"])("rechaza %s", async (number) => {
    const f = fixture();
    expect((await f.handle(id, number, true)).status).toBe(404);
    expect(f.from).not.toHaveBeenCalled();
  });
});
