import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotScenarios } from "@/mocks/documents";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

import { ReviewContainer, type Frozen } from "./review-container";

const ready = snapshotScenarios.find((s) => s.state.status === "ready")!.state;
if (ready.status !== "ready") throw new Error("escenario ready inexistente");

const ACTIVE: Frozen = {
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  selection: ["autor", "comprador"],
  frozenFromDraftRevision: 3,
  snapshot: { status: "ready", revisionId: "rev-1", snapshotId: "snap-1", content: ready.content, documentStatus: "esperando_confirmaciones", controlStatus: "con_advertencias", confirmationStatus: "pendiente", hcsStatus: "no_iniciado" },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const aggregate = (confirmationStatus: string, missingRoles: string[], confirmed = 0, rejected = 0) => ({ confirmationStatus, missingRoles, confirmed, rejected });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => vi.unstubAllGlobals());

function dimensions() {
  const list = screen.getByLabelText("Estado del snapshot");
  const value = (name: string) => within(list).getByText(name).parentElement!.querySelector("dd")!.textContent;
  return { documento: value("Documento"), confirmaciones: value("Confirmaciones"), hcs: value("Registro en Hedera") };
}

describe("ReviewContainer · estados de la vista del snapshot", () => {
  it("refleja el avance actual: completa conserva el documento y el contenido congelado no cambia", async () => {
    fetchMock.mockImplementation(async () => json(aggregate("completa", [], 2)));
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" active={ACTIVE} />);
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Completa"));
    expect(dimensions().documento).toBe("Esperando confirmaciones");
    expect(screen.getByText(ready.content.operation.title)).toBeInTheDocument();
  });

  it("un rechazo actualiza confirmaciones y documento sin recargar", async () => {
    fetchMock.mockImplementation(async () => json(aggregate("rechazada", [], 1, 1)));
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" active={ACTIVE} />);
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Rechazada"));
    expect(dimensions().documento).toBe("Revisión rechazada");
  });

  it("tras confirmar como autor el estado de confirmaciones sale de «Pendiente»", async () => {
    let confirmed = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        confirmed = true;
        return json({ responseId: "r1", confirmationStatus: "parcial" }, 201);
      }
      return json(confirmed ? aggregate("parcial", ["comprador"], 1) : aggregate("pendiente", ["autor", "comprador"]));
    });
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" active={ACTIVE} />);
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Pendiente"));
    await user.click(screen.getByRole("checkbox", { name: /revisé la operación/i }));
    await user.click(screen.getByRole("button", { name: "Confirmar como proveedor" }));
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Parcial"));
  });

  it("documento finalizado y sello del servidor se reflejan sin mutar el contenido", async () => {
    fetchMock.mockImplementation(async () => json(aggregate("completa", [], 2)));
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="registrado" active={ACTIVE} documentFinalized />);
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Completa"));
    expect(dimensions().documento).toBe("Finalizado");
    expect(dimensions().hcs).toBe("Registrado");
  });

  it("una respuesta tardía de la revisión anterior no contamina la nueva", async () => {
    let releaseOld: (response: Response) => void = () => {};
    const oldResponse = new Promise<Response>((resolve) => (releaseOld = resolve));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (init?.method === "POST" && target.endsWith("/revisions")) {
        return json({ revision: { revisionId: "rev-2", documentStatus: "esperando_confirmaciones", controlStatus: "con_advertencias", confirmationStatus: "pendiente" }, snapshot: { snapshotId: "snap-2", snapshotHash: "b".repeat(64), content: ready.content }, unchanged: false }, 201);
      }
      if (target === "/api/revisions/rev-1/confirmations") return oldResponse;
      return json(aggregate("pendiente", ["autor"]));
    });
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" active={ACTIVE} />);
    await user.click(await screen.findByRole("button", { name: /modificar participantes/i }));
    await user.click(screen.getByRole("checkbox", { name: /^Transportista/ }));
    await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));
    await waitFor(() => expect(dimensions().confirmaciones).toBe("Pendiente"));
    expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/revisions/rev-2/confirmations")).toBe(true);

    releaseOld(json(aggregate("rechazada", [], 1, 1)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dimensions().confirmaciones).toBe("Pendiente");
    expect(dimensions().documento).toBe("Esperando confirmaciones");
  });
});
