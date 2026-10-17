import { describe, expect, it, vi } from "vitest";

import type { Draft } from "@/lib/contracts/core";
import { createDraftHandler, type DraftRead } from "@/lib/documents/preview-http";
import type { SessionCheck } from "@/lib/supabase/auth";

const owner = "aaf3163d-8ec5-411d-a7ac-9219f47fb9b1";
const doc = "dc6e5bb1-c726-45bb-a048-97810495992b";
const authenticated: SessionCheck = { status: "authenticated", user: { id: owner, email: null } };
const draft: Draft = {
  draftId: "d1", documentId: doc, draftRevision: 2, updatedAt: "2026-10-16T12:00:00Z",
  content: { title: "Entrega de cajas", body: "Se entregaron 3 cajas.\nSegunda línea.", corrections: ["Ortografía"] },
};

function setup(read: DraftRead, session: SessionCheck = authenticated) {
  const readDraft = vi.fn(async () => read);
  const getContext = vi.fn(async () => ({ session, readDraft }));
  return { readDraft, getContext, deps: { getContext } };
}
const get = (headers: Record<string, string> = {}) => new Request(`https://galcoa.test/api/documents/${doc}/preview`, { headers });

describe("GET /api/documents/[id]/preview (store doble, no demuestra Supabase)", () => {
  it("sin sesión: 401", async () => {
    const { deps, readDraft } = setup({ status: "ok", draft }, { status: "anonymous" });
    const response = await createDraftHandler(deps, "preview")(get(), doc);
    expect(response.status).toBe(401);
    expect(readDraft).not.toHaveBeenCalled();
  });

  it("documento ajeno o inexistente: 404", async () => {
    const response = await createDraftHandler(setup({ status: "not_available" }).deps, "preview")(get(), doc);
    expect(response.status).toBe(404);
  });

  it("sin borrador: 409 NO_DRAFT", async () => {
    const response = await createDraftHandler(setup({ status: "no_draft" }).deps, "preview")(get(), doc);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "NO_DRAFT" } });
  });

  it("id inválido: 404; cross-site: 403; otro método: 405", async () => {
    const handler = createDraftHandler(setup({ status: "ok", draft }).deps, "preview");
    expect((await handler(get(), "no-uuid")).status).toBe(404);
    expect((await handler(get({ "Sec-Fetch-Site": "cross-site" }), doc)).status).toBe(403);
    expect((await handler(new Request("https://galcoa.test/x", { method: "POST" }), doc)).status).toBe(405);
  });

  it("borrador: application/pdf inline, no-store y bytes de PDF", async () => {
    const response = await createDraftHandler(setup({ status: "ok", draft }).deps, "preview")(get({ "Sec-Fetch-Site": "same-origin" }), doc);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("resumen JSON del borrador para el chat", async () => {
    const response = await createDraftHandler(setup({ status: "ok", draft }).deps, "summary")(get(), doc);
    expect(await response.json()).toEqual({ draftId: "d1", draftRevision: 2, title: "Entrega de cajas" });
  });
});
