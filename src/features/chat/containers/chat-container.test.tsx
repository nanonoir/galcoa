import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatContainer } from "./chat-container";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const error = { code: "AI_PROVIDER_ERROR", stage: "ia", retryable: true, correlationId: "corr-1" };
const message = (id: string, sender: "autor" | "agente", content: string) => ({
  messageId: id, documentId: DOC, sender, content, declaredEventDate: { kind: "unknown" }, uploadedAt: "2026-10-16T12:00:00Z",
});
const ndjson = (...events: object[]) =>
  new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(""), { headers: { "Content-Type": "application/x-ndjson", "X-Turn-Id": "t1" } });

let history: unknown[];
let chat: (init: RequestInit) => Response | Promise<Response>;
let contrastResponse: () => Response;
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  history = [];
  contrastResponse = () => Response.json({ result: { result: "con_advertencias", findings: [{ message: "Fecha dudosa", severity: "warning" }] } });
  vi.stubGlobal("crypto", { randomUUID: () => "client-message-1" });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/messages")) return Response.json({ result: history });
    if (url.endsWith("/chat")) return chat(init!);
    return contrastResponse();
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  calls.length = 0;
});

async function send(text = "Entregué 3 cajas") {
  render(<ChatContainer documentId={DOC} />);
  await userEvent.type(screen.getByLabelText("Mensaje"), text);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("ChatContainer (MVP-054; red simulada, no es integración real)", () => {
  it("muestra el draft, el mensaje del agente y avisos no bloqueantes; sin ceros inventados en replay", async () => {
    chat = () => {
      history = [message("m1", "autor", "Entregué 3 cajas"), message("m2", "agente", "Preparé el borrador «Entrega».")];
      return ndjson({ type: "turn.started", turnId: "t1", attempt: 1, retried: false }, { type: "user_message", messageId: "m1" }, { type: "drafting" },
        { type: "draft", draftId: "d1", draftRevision: 1, title: "Entrega" }, { type: "agent_message", messageId: "m2", content: "Preparé el borrador «Entrega»." }, { type: "done" });
    };
    await send();
    expect(await screen.findByText(/Borrador «Entrega» actualizado \(revisión 1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Advertencias para revisar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no informados/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Advertencia: Fecha dudosa/)).toBeInTheDocument();
    expect(screen.getByText("Preparé el borrador «Entrega».")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/contrast") && c.init?.method === "POST")).toBe(true);
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/chat"))!.init!.body as string)).toEqual({ clientMessageId: "client-message-1", content: "Entregué 3 cajas" });
  });

  it("muestra los conteos solo si el evento los trae", async () => {
    chat = () => ndjson({ type: "draft", draftId: "d1", draftRevision: 2, title: "T", warnings: 0, notInformed: 2 }, { type: "done" });
    contrastResponse = () => Response.json({ error }, { status: 503 });
    await send();
    expect(await screen.findByText(/Advertencias para revisar: 0/)).toBeInTheDocument();
    expect(screen.getByText(/«no informados»: 2/)).toBeInTheDocument();
    expect(await screen.findByText("Contraste no disponible")).toBeInTheDocument();
  });

  it("error de proveedor: aviso técnico y reintento con el mismo clientMessageId", async () => {
    let attempt = 0;
    chat = () => (++attempt === 1 ? Response.json({ error }, { status: 503 }) : ndjson({ type: "done" }));
    await send();
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar respuesta" }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/chat"))).toHaveLength(2));
    const bodies = calls.filter((c) => c.url.endsWith("/chat")).map((c) => JSON.parse(c.init!.body as string));
    expect(bodies[0]).toEqual(bodies[1]);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("evento error a mitad del flujo y flujo cortado son errores, no éxito", async () => {
    chat = () => ndjson({ type: "drafting" }, { type: "error", error });
    await send();
    expect(await screen.findByText("El proveedor de IA no respondió")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/contrast"))).toBe(false);
  });

  it("cancelar aborta la petición y ofrece reintentar", async () => {
    chat = (init) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("abort", "AbortError"))));
    await send();
    await act(async () => {
      await userEvent.click(await screen.findByRole("button", { name: "Cancelar respuesta" }));
    });
    expect(await screen.findByText("Respuesta cancelada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar respuesta" })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/contrast"))).toBe(false);
  });
});
