import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotScenarios } from "@/mocks/documents";

import { ReviewContainer } from "./review-container";

const ready = snapshotScenarios.find((s) => s.state.status === "ready")!.state;
if (ready.status !== "ready") throw new Error("escenario ready inexistente");

const REVISION = { revisionId: "rev-1", documentStatus: "esperando_confirmaciones", controlStatus: "con_advertencias", confirmationStatus: "pendiente" };
const SNAPSHOT = { snapshotId: "snap-1", snapshotHash: "a".repeat(64), content: ready.content };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});
afterEach(() => vi.unstubAllGlobals());

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null }));
}

describe("ReviewContainer", () => {
  it("congela con el borrador esperado y emite un enlace por tercero elegido", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ token: "tok-comprador", role: "comprador" }, 201))
      .mockResolvedValueOnce(json({ confirmationStatus: "pendiente", missingRoles: ["autor", "comprador"], confirmed: 0, rejected: 0 }));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} />);

    await user.click(screen.getByRole("checkbox", { name: "Comprador" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    await screen.findByText(/compartir con los participantes/i);
    const [freeze, invite] = calls();
    expect(freeze).toMatchObject({ url: "/api/documents/doc-1/revisions", method: "POST", body: { expectedDraftRevision: 3, selection: ["comprador"] } });
    expect(invite).toMatchObject({ url: "/api/revisions/rev-1/invitations", method: "POST", body: { role: "comprador" } });
    expect(screen.getByText(/\/confirm\/tok-comprador/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeDisabled();
  });

  it("un conflicto de borrador se muestra como error y no congela nada", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "STALE_DRAFT" } }, 409));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} />);
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));
    expect(await screen.findByText(/el borrador cambió/i)).toBeInTheDocument();
    expect(screen.queryByText(/tu confirmación/i)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeEnabled();
  });

  it("solo autor: no emite enlaces y permite confirmar tras marcar la casilla", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ confirmationStatus: "pendiente", missingRoles: ["autor"], confirmed: 0, rejected: 0 }))
      .mockResolvedValueOnce(json({ responseId: "r1", confirmationStatus: "completa" }, 201))
      .mockResolvedValueOnce(json({ confirmationStatus: "completa", missingRoles: [], confirmed: 1, rejected: 0 }));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={0} />);
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    const confirm = await screen.findByRole("button", { name: "Confirmar como autor" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /revisé la operación/i }));
    await user.click(confirm);

    await waitFor(() => expect(screen.getByRole("button", { name: "Ya confirmaste" })).toBeDisabled());
    const [, , confirmCall, aggregate] = calls();
    expect(confirmCall).toMatchObject({
      url: "/api/documents/doc-1/revisions/confirm",
      body: { revisionId: "rev-1", snapshotId: "snap-1", decision: "confirmar", checkboxChecked: true, schemaVersion: 1 },
    });
    expect(aggregate.url).toBe("/api/revisions/rev-1/confirmations");
    expect(screen.getByText("Todos confirmaron")).toBeInTheDocument();
  });

  it("si falla emitir un enlace lo informa sin simular éxito", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ error: { code: "TECHNICAL_FAILURE" } }, 503));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={1} />);
    await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));
    expect(await screen.findByText(/no se pudo generar el enlace/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/confirm\//)).not.toBeInTheDocument();
  });

  it("un rechazo se informa como respuesta de negocio y no atribuye roles de forma ambigua", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ token: "tok-comprador", role: "comprador" }, 201))
      .mockResolvedValueOnce(json({ confirmationStatus: "rechazada", missingRoles: [], confirmed: 1, rejected: 1 }));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} />);
    await user.click(screen.getByRole("checkbox", { name: "Comprador" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    expect(await screen.findByText(/un participante rechazó/i)).toBeInTheDocument();
    expect(screen.queryByText("Confirmó")).not.toBeInTheDocument();
    expect(screen.queryByText("Rechazó")).not.toBeInTheDocument();
    expect(screen.queryByText(/algo no salió bien/i)).not.toBeInTheDocument();
  });
});
