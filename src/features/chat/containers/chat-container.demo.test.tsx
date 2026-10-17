import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatContainer } from "./chat-container";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const ndjson = (...events: object[]) =>
  new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(""), { headers: { "Content-Type": "application/x-ndjson", "X-Turn-Id": "t1" } });

const urls: string[] = [];
beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "client-message-1" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith("/messages")) return Response.json({ result: [] });
      if (url.endsWith("/chat")) {
        return ndjson({ type: "turn.started", turnId: "t1", attempt: 1, retried: false }, { type: "draft", draftId: "d1", draftRevision: 1, title: "T", warnings: 2, notInformed: 1 }, { type: "done" });
      }
      return Response.json({ result: { result: "con_advertencias", findings: [{ message: "Fecha dudosa", severity: "warning" }] } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  urls.length = 0;
});

// Interruptor de la demo encendido (valor real): no se consulta el contraste ni se muestran avisos.
describe("ChatContainer · advertencias ocultas (demo)", () => {
  it("tras publicar un borrador no llama al endpoint de contraste ni muestra advertencias", async () => {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.type(screen.getByLabelText("Mensaje"), "Entregué 3 cajas");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/Borrador «T» actualizado/)).toBeInTheDocument();
    expect(urls.some((u) => u.endsWith("/contrast"))).toBe(false);
    expect(screen.queryByText(/advertencia|contraste/i)).not.toBeInTheDocument();
  });
});
