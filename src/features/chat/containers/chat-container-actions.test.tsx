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
const calls: { url: string; init?: RequestInit }[] = [];
const notFound = () => Response.json({ error: { code: "NO_DRAFT" } }, { status: 409 });

beforeEach(() => {
  hasDraft = true;
  documentTitle = "Documento sin título";
  freezeStatus = 200;
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
      if (url.endsWith("/finalization")) return Response.json({ operation: { phase: "queued", versionNumber: null } });
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

  it("Confirmar exige la casilla; congela solo con el autor, confirma y muestra Subir Contrato", async () => {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    const accept = screen.getAllByRole("button", { name: "Confirmar" }).at(-1)!;
    expect(accept).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Revisé la operación y confirmo esta versión."));
    await userEvent.click(accept);

    expect(await screen.findByRole("button", { name: /Subir Contrato/ })).toBeInTheDocument();
    const freeze = calls.find((c) => c.url.endsWith("/revisions") && c.init?.method === "POST")!;
    expect(JSON.parse(freeze.init!.body as string)).toEqual({ expectedDraftRevision: 3, selection: [], idempotencyKey: "key-1" });
    const confirm = calls.find((c) => c.url.endsWith("/revisions/confirm"))!;
    expect(JSON.parse(confirm.init!.body as string)).toMatchObject({ revisionId: "rev-1", snapshotId: "snap-1", snapshotHash: "hash-1", decision: "confirmar", checkboxChecked: true });
  });

  it("si el autor ya había confirmado, no vuelve a confirmar", async () => {
    aggregates = [{ confirmationStatus: "completa", missingRoles: [] }];
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await userEvent.click(screen.getByLabelText("Revisé la operación y confirmo esta versión."));
    await userEvent.click(screen.getAllByRole("button", { name: "Confirmar" }).at(-1)!);
    expect(await screen.findByRole("button", { name: /Subir Contrato/ })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/revisions/confirm"))).toBe(false);
  });

  it("un fallo del servidor se muestra como error y no ofrece Subir Contrato", async () => {
    freezeStatus = 409;
    render(<ChatContainer documentId={DOC} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await userEvent.click(screen.getByLabelText("Revisé la operación y confirmo esta versión."));
    await userEvent.click(screen.getAllByRole("button", { name: "Confirmar" }).at(-1)!);
    expect((await screen.findAllByText(/El borrador cambió mientras confirmabas/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Subir Contrato/ })).not.toBeInTheDocument();
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
