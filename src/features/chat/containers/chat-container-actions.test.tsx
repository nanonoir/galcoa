import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatContainer } from "./chat-container";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const ndjson = (...events: object[]) =>
  new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(""), { headers: { "Content-Type": "application/x-ndjson", "X-Turn-Id": "t1" } });

let hasDraft: boolean;
let documentTitle: string;
let aggregates: Record<string, unknown>[];
let freezeStatus: number;
let finalizationBody: object;
const calls: { url: string; init?: RequestInit }[] = [];
const notFound = () => Response.json({ error: { code: "NO_DRAFT" } }, { status: 409 });

beforeEach(() => {
  hasDraft = true;
  documentTitle = "Documento sin título";
  freezeStatus = 200;
  finalizationBody = { operation: { phase: "queued", versionNumber: null } };
  aggregates = [{ confirmationStatus: "pendiente", missingRoles: ["autor"] }, { confirmationStatus: "completa", missingRoles: [] }];
  vi.stubGlobal("crypto", { randomUUID: () => "key-1" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/messages")) return Response.json({ result: [] });
      if (url.endsWith("/draft")) return hasDraft ? Response.json({ draftId: "d1", draftRevision: 3, title: "Entrega" }) : notFound();
      if (url.endsWith("/chat")) return ndjson({ type: "draft", draftId: "d1", draftRevision: 1, title: "Entrega de cajas" }, { type: "done" });
      if (url.endsWith("/revisions")) {
        return freezeStatus === 200
          ? Response.json({ revision: { revisionId: "rev-1" }, snapshot: { snapshotId: "snap-1", snapshotHash: "hash-1" } })
          : Response.json({ error: { code: "STALE_DRAFT" } }, { status: freezeStatus });
      }
      if (url.endsWith("/revisions/confirm")) return Response.json({ ok: true });
      if (url.endsWith("/confirmations")) return Response.json(aggregates.shift());
      if (url.endsWith("/finalization")) return Response.json(finalizationBody);
      if (url === `/api/documents/${DOC}`) {
        return init?.method === "PATCH" ? Response.json({ result: {} }) : Response.json({ result: { title: documentTitle } });
      }
      return Response.json({});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  calls.length = 0;
});

describe("Barra de acciones del chat (red simulada, no es integración real)", () => {
  it("no aparece sin borrador", async () => {
    hasDraft = false;
    render(<ChatContainer documentId={DOC} />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/draft"))).toBe(true));
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar/ })).not.toBeInTheDocument();
  });

  it("no aparece si el servidor marca el documento como finalizado, aunque haya borrador", async () => {
    render(<ChatContainer documentId={DOC} finalized />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/draft"))).toBe(true));
    expect(screen.queryByTestId("chat-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compartir/ })).not.toBeInTheDocument();
  });

  it("aparece al recargar con un borrador existente y Revisar abre el iframe de la vista previa", async () => {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: /Revisar/ }));
    const frame = await screen.findByTitle("Vista previa del PDF");
    expect(frame).toHaveAttribute("src", `/api/documents/${DOC}/preview`);
    expect(screen.getByRole("link", { name: /Abrir en pestaña nueva/ })).toHaveAttribute("href", `/api/documents/${DOC}/preview`);
  });

  it("Compartir con terceros navega a la revisión", async () => {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartir con terceros/ }));
    expect(router.push).toHaveBeenCalledWith(`/documents/${DOC}/review`);
  });

  it("envía a la revisión completa sin congelar ni confirmar solo con el proveedor", async () => {
    render(<ChatContainer documentId={DOC} />);
    expect(await screen.findByRole("link", { name: "Revisar y confirmar" })).toHaveAttribute("href", `/documents/${DOC}/review`);
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/revisions") || c.url.endsWith("/revisions/confirm"))).toBe(false);
  });

  it("el chat no publica una versión ni ofrece un sello antes de las confirmaciones obligatorias", async () => {
    finalizationBody = { operation: { phase: "published", versionNumber: 4 } };
    render(<ChatContainer documentId={DOC} />);
    await screen.findByRole("link", { name: "Revisar y confirmar" });
    expect(screen.queryByRole("button", { name: /Finalizar y registrar huella/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/finalization"))).toBe(false);
  });

  it("si el autor ya había confirmado, no vuelve a confirmar", async () => {
    aggregates = [{ confirmationStatus: "completa", missingRoles: [] }];
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: /Compartir con terceros/ }));
    expect(router.push).toHaveBeenCalledWith(`/documents/${DOC}/review`);
    expect(calls.some((c) => c.url.endsWith("/revisions/confirm"))).toBe(false);
  });

  it("el acceso a revisión no dispara una congelación ni un error de confirmación desde el chat", async () => {
    freezeStatus = 409;
    render(<ChatContainer documentId={DOC} />);
    await screen.findByRole("link", { name: "Revisar y confirmar" });
    expect(calls.some((c) => c.url.endsWith("/revisions"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Finalizar y registrar huella/ })).not.toBeInTheDocument();
  });
});

describe("Auto-título al publicar el primer borrador", () => {
  async function publish() {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.type(screen.getByLabelText("Mensaje"), "Entregué 3 cajas");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  }

  it("renombra una sola vez si el título sigue siendo el predeterminado", async () => {
    await publish();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    const patches = calls.filter((c) => c.init?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0]!.init!.body as string)).toEqual({ title: "Entrega de cajas" });
  });

  it("no renombra si el título ya fue cambiado", async () => {
    documentTitle = "Mi contrato";
    await publish();
    await waitFor(() => expect(calls.some((c) => c.url === `/api/documents/${DOC}` && !c.init?.method)).toBe(true));
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
  });
});
