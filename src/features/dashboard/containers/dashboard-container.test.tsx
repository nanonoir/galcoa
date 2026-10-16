import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardViewState } from "@/lib/contracts/dashboard";
import type { DocumentSummary } from "@/lib/contracts/document";

import { DashboardContainer, NEW_DOCUMENT_TITLE } from "./dashboard-container";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const summary: DocumentSummary = {
  id: "doc-1",
  title: "Entrega de lote 7",
  documentStatus: "borrador",
  controlStatus: "sin_evaluar",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-10-16T12:00:00.000Z",
  warnings: [],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const empty: DashboardViewState = { status: "ready", documents: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DashboardContainer (MVP-116/I2)", () => {
  it("crear: POST real con clave de idempotencia y navega al documento creado", async () => {
    const fetchMock = vi.fn(async () => json({ schemaVersion: 1, outcome: "completed", result: summary }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DashboardContainer initialState={empty} />);
    await userEvent.click(screen.getByRole("button", { name: "Crear documento" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/documents/doc-1"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/documents");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.title).toBe(NEW_DOCUMENT_TITLE);
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it("fallo de la API: muestra error, no navega y reintenta con la misma clave", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: "TECHNICAL_FAILURE" } }, 503))
      .mockResolvedValueOnce(json({ result: summary }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DashboardContainer initialState={empty} />);
    await userEvent.click(screen.getByRole("button", { name: "Crear documento" }));

    expect(await screen.findByText("No se pudo crear el documento. Intenta nuevamente.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(router.refresh).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/documents/doc-1"));
    const keys = fetchMock.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("respuesta con forma inválida es un error, nunca éxito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ result: { id: "x" } })));
    render(<DashboardContainer initialState={empty} />);
    await userEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    expect(await screen.findByText("No se pudo crear el documento. Intenta nuevamente.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("sesión vencida (401): vuelve al acceso sin mostrar error genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "NO_SESSION" } }, 401)));
    render(<DashboardContainer initialState={empty} />);
    await userEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/acceso"));
    expect(screen.queryByText("No se pudo crear el documento. Intenta nuevamente.")).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("abrir: navega a la ruta del documento", async () => {
    render(<DashboardContainer initialState={{ status: "ready", documents: [summary] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir Entrega de lote 7" }));
    expect(router.push).toHaveBeenCalledWith("/documents/doc-1");
  });
});
