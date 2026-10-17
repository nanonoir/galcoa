import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotScenarios } from "@/mocks/documents";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

import { ReviewContainer, type Frozen } from "./review-container";

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
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" />);

    await user.click(screen.getByRole("checkbox", { name: "Comprador" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    await screen.findByText(/compartir con los participantes/i);
    const [freeze, invite] = calls();
    expect(freeze).toMatchObject({ url: "/api/documents/doc-1/revisions", method: "POST", body: { expectedDraftRevision: 3, selection: ["comprador"] } });
    expect(invite).toMatchObject({ url: "/api/revisions/rev-1/invitations", method: "POST", body: { role: "comprador" } });
    expect(screen.getByText(/\/confirm\/tok-comprador/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeDisabled();
    expect(screen.getByRole("img", { name: /código qr del enlace de comprador/i })).toBeInTheDocument();
  });

  it("un conflicto de borrador se muestra como error y no congela nada", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "STALE_DRAFT" } }, 409));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" />);
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
    render(<ReviewContainer documentId="doc-1" draftRevision={0} hcsStatus="no_iniciado" />);
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
    render(<ReviewContainer documentId="doc-1" draftRevision={1} hcsStatus="no_iniciado" />);
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
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="no_iniciado" />);
    await user.click(screen.getByRole("checkbox", { name: "Comprador" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    expect(await screen.findByText(/un participante rechazó/i)).toBeInTheDocument();
    expect(screen.queryByText("Confirmó")).not.toBeInTheDocument();
    expect(screen.queryByText("Rechazó")).not.toBeInTheDocument();
    expect(screen.queryByText(/algo no salió bien/i)).not.toBeInTheDocument();
  });

  it("si falla emitir un rol conserva el enlace del otro y deja reemitir el faltante", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ token: "tok-intermediario", role: "intermediario" }, 201))
      .mockResolvedValueOnce(json({ error: { code: "TECHNICAL_FAILURE" } }, 503))
      .mockResolvedValueOnce(json({ confirmationStatus: "pendiente", missingRoles: ["autor", "intermediario", "comprador"], confirmed: 0, rejected: 0 }))
      .mockResolvedValueOnce(json({ token: "tok-comprador", role: "comprador" }, 201));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={1} hcsStatus="no_iniciado" />);
    await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
    await user.click(screen.getByRole("checkbox", { name: "Comprador" }));
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));

    expect(await screen.findByText(/comprador: no se pudo generar el enlace/i)).toBeInTheDocument();
    expect(screen.getByText(/\/confirm\/tok-intermediario/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generar enlace nuevo para comprador/i }));
    expect(await screen.findByText(/\/confirm\/tok-comprador/)).toBeInTheDocument();
    expect(screen.getByText(/\/confirm\/tok-intermediario/)).toBeInTheDocument();
  });

  it("muestra el sello del servidor y no inventa la versión finalizada", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: false }, 201))
      .mockResolvedValueOnce(json({ confirmationStatus: "pendiente", missingRoles: ["autor"], confirmed: 0, rejected: 0 }));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={0} hcsStatus="registrado" />);
    await user.click(screen.getByRole("button", { name: /congelar y generar enlaces/i }));
    expect(await screen.findByText(/número de versión finalizada no disponible/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sello registrado/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/todavía no finalizada/i)).not.toBeInTheDocument();
  });
});

const ACTIVE: Frozen = {
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  selection: ["autor", "comprador"],
  snapshot: { status: "ready", revisionId: "rev-1", snapshotId: "snap-1", content: ready.content, documentStatus: "esperando_confirmaciones", controlStatus: "con_advertencias", confirmationStatus: "pendiente", hcsStatus: "pendiente" },
};
const PENDING = { confirmationStatus: "pendiente", missingRoles: ["autor", "comprador"], confirmed: 0, rejected: 0 };

describe("ReviewContainer con revisión vigente (recarga)", () => {
  it("hidrata sin congelar ni emitir enlaces; solo lee el avance y reemite por acción explícita", async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith("/invitations") ? json({ token: "tok-nuevo" }, 201) : json(PENDING)));
    const user = userEvent.setup();
    render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);

    await screen.findByText(/faltan confirmaciones/i);
    expect(calls()).toEqual([{ url: "/api/revisions/rev-1/confirmations", method: "GET", body: null }]);
    expect(screen.queryByRole("button", { name: /congelar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /generar enlace nuevo para comprador/i }));
    expect(await screen.findByText(/\/confirm\/tok-nuevo/)).toBeInTheDocument();
    expect(calls().filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/revisions/rev-1/invitations"]);
  });

  describe("reabrir la revisión", () => {
    const NEW_REVISION = { ...REVISION, revisionId: "rev-2" };
    const NEW_SNAPSHOT = { ...SNAPSHOT, snapshotId: "snap-2" };
    const openEditor = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole("button", { name: /modificar participantes|incorporar el borrador/i }));

    it("editar y cancelar no hace peticiones de escritura y conserva la revisión vigente", async () => {
      fetchMock.mockImplementation(async () => json(PENDING));
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await openEditor(user);
      expect(screen.getByText(/la revisión anterior sigue vigente/i)).toBeInTheDocument();
      await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
      await user.click(screen.getByRole("button", { name: /cancelar y conservar/i }));

      expect(calls().filter((c) => c.method !== "GET")).toEqual([]);
      expect(screen.getByRole("checkbox", { name: "Intermediario" })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: "Intermediario" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeChecked();
    });

    it("sin cambio material no permite crear otra revisión", async () => {
      fetchMock.mockImplementation(async () => json(PENDING));
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} />);
      await openEditor(user);
      expect(screen.getByRole("button", { name: /crear nueva revisión/i })).toBeDisabled();
      await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
      expect(screen.getByRole("button", { name: /crear nueva revisión/i })).toBeEnabled();
    });

    it("con borrador distinto congela con el borrador actual, emite enlaces nuevos y sustituye la revisión", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && String(url).endsWith("/revisions")) return json({ revision: NEW_REVISION, snapshot: NEW_SNAPSHOT, unchanged: false }, 201);
        if (String(url).endsWith("/invitations")) return json({ token: "tok-nuevo" }, 201);
        return json(PENDING);
      });
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={4} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} />);
      expect(await screen.findByText(/el borrador cambió después de congelar/i)).toBeInTheDocument();
      await openEditor(user);
      await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));

      expect(await screen.findByText(/\/confirm\/tok-nuevo/)).toBeInTheDocument();
      const posts = calls().filter((c) => c.method === "POST");
      expect(posts[0]).toMatchObject({ url: "/api/documents/doc-1/revisions", body: { expectedDraftRevision: 4, selection: ["comprador"], idempotencyKey: "11111111-1111-4111-8111-111111111111" } });
      expect(posts[1].url).toBe("/api/revisions/rev-2/invitations");
      expect(screen.queryByRole("button", { name: /crear nueva revisión/i })).not.toBeInTheDocument();
    });

    it("«unchanged» no emite enlaces ni reemplaza el estado anterior", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") return json({ revision: REVISION, snapshot: SNAPSHOT, unchanged: true }, 200);
        return json(PENDING);
      });
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={4} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} />);
      await openEditor(user);
      await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));

      expect(await screen.findByText(/no hubo cambios/i)).toBeInTheDocument();
      expect(calls().filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/documents/doc-1/revisions"]);
      expect(screen.queryByRole("button", { name: /crear nueva revisión/i })).not.toBeInTheDocument();
    });

    it("si el servidor no encuentra el documento conserva la revisión vigente y reintenta con la misma clave", async () => {
      let n = 0;
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return json({ error: { code: "NOT_AVAILABLE" } }, 404);
        return json(PENDING);
      });
      vi.stubGlobal("crypto", { randomUUID: () => `key-${++n}` });
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={4} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} />);
      await openEditor(user);
      await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));
      expect(await screen.findByText(/algo no salió bien/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));
      await waitFor(() => expect(calls().filter((c) => c.method === "POST")).toHaveLength(2));
      const keys = calls().filter((c) => c.method === "POST").map((c) => c.body.idempotencyKey);
      expect(keys[0]).toBe(keys[1]);
      expect(screen.getByText(/tu confirmación/i)).toBeInTheDocument();
    });

    it("«Subir Contrato» solo aparece con todas las confirmaciones y revisión vigente", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "pendiente", missingRoles: ["comprador"], confirmed: 1, rejected: 0 }));
      const first = render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await screen.findByText(/faltan confirmaciones/i);
      expect(screen.queryByRole("button", { name: /^subir contrato$/i })).not.toBeInTheDocument();
      first.unmount();

      fetchMock.mockImplementation(async () => json({ confirmationStatus: "completa", missingRoles: [], confirmed: 2, rejected: 0 }));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      expect(await screen.findByRole("button", { name: /^subir contrato$/i })).toBeEnabled();
    });

    it("con confirmación completa y documento sin finalizar permite editar; cancelar no muta", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "completa", missingRoles: [], confirmed: 2, rejected: 0 }));
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await openEditor(user);
      await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
      await user.click(screen.getByRole("button", { name: /cancelar y conservar/i }));
      expect(calls().filter((c) => c.method !== "GET")).toEqual([]);
      expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeChecked();
    });

    it("con confirmación completa, cambiar la selección congela solo la selección nueva y no hereda confirmaciones", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && String(url).endsWith("/revisions")) return json({ revision: NEW_REVISION, snapshot: NEW_SNAPSHOT, unchanged: false }, 201);
        if (String(url).endsWith("/invitations")) return json({ token: "tok-n" }, 201);
        if (String(url).endsWith("/rev-2/confirmations")) return json({ confirmationStatus: "pendiente", missingRoles: ["autor", "comprador", "intermediario"], confirmed: 0, rejected: 0 });
        return json({ confirmationStatus: "completa", missingRoles: [], confirmed: 2, rejected: 0 });
      });
      const user = userEvent.setup();
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} />);
      await openEditor(user);
      await user.click(screen.getByRole("checkbox", { name: "Intermediario" }));
      await user.click(screen.getByRole("button", { name: /crear nueva revisión/i }));
      await screen.findAllByText(/\/confirm\/tok-n/);
      const freeze = calls().find((c) => c.method === "POST" && c.url.endsWith("/revisions"))!;
      expect(freeze.body).toEqual({ expectedDraftRevision: 3, selection: ["intermediario", "comprador"], idempotencyKey: expect.any(String) });
      expect(await screen.findByRole("button", { name: "Confirmar como autor" })).toBeDisabled();
      expect(screen.queryByText("Ya confirmaste")).not.toBeInTheDocument();
    });

    it("con documento finalizado no ofrece reabrir", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "completa", missingRoles: [], confirmed: 2, rejected: 0 }));
      render(<ReviewContainer documentId="doc-1" draftRevision={4} hcsStatus="pendiente" active={{ ...ACTIVE, frozenFromDraftRevision: 3 }} documentFinalized />);
      await screen.findByText(/tu confirmación/i);
      expect(screen.queryByRole("button", { name: /modificar participantes|incorporar el borrador/i })).not.toBeInTheDocument();
    });

    it("una revisión sustituida ofrece recargar y deshabilita acciones sobre la vieja", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "sustituida", missingRoles: ["autor"], confirmed: 0, rejected: 0 }));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      expect(await screen.findByRole("button", { name: /recargar la revisión vigente/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /modificar participantes|incorporar el borrador/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmar como autor" })).toBeDisabled();
    });

    it("una revisión rechazada ofrece editar", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "rechazada", missingRoles: [], confirmed: 1, rejected: 1 }));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      expect(await screen.findByText(/un participante rechazó/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /modificar participantes/i })).toBeInTheDocument();
    });
  });

  describe("consulta periódica", () => {
    const aggregateCalls = () => calls().filter((c) => c.url.endsWith("/confirmations")).length;
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("actualiza en silencio con la pestaña visible, sin anunciar ni mostrar errores", async () => {
      fetchMock.mockImplementation(async () => json(PENDING));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await advance(0);
      await advance(10_000);
      expect(aggregateCalls()).toBe(2);
      expect(screen.getByRole("status")).toHaveTextContent("");
      fetchMock.mockImplementation(async () => json({ error: { code: "TECHNICAL_FAILURE" } }, 503));
      await advance(20_000);
      expect(aggregateCalls()).toBe(3);
      expect(screen.queryByText(/algo no salió bien/i)).not.toBeInTheDocument();
    });

    it("no consulta con la pestaña oculta", async () => {
      fetchMock.mockImplementation(async () => json(PENDING));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await advance(0);
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      await advance(10_000);
      expect(aggregateCalls()).toBe(1);
    });

    it("se detiene en un estado terminal", async () => {
      fetchMock.mockImplementation(async () => json({ confirmationStatus: "completa", missingRoles: [], confirmed: 2, rejected: 0 }));
      render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await advance(0);
      await advance(120_000);
      expect(aggregateCalls()).toBe(1);
    });

    it("se detiene al desmontar", async () => {
      fetchMock.mockImplementation(async () => json(PENDING));
      const { unmount } = render(<ReviewContainer documentId="doc-1" draftRevision={3} hcsStatus="pendiente" active={ACTIVE} />);
      await advance(0);
      unmount();
      await advance(120_000);
      expect(aggregateCalls()).toBe(1);
    });
  });
});
