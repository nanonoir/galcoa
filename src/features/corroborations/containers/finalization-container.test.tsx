import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FINALIZATION_POLL_MAX_ATTEMPTS, FINALIZATION_POLL_MS, FinalizationContainer } from "./finalization-container";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const op = (phase: string, versionNumber: number | null = null) => ({ operation: { operationId: "op-1", phase, status: "active", versionNumber } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function click(name: RegExp) {
  await act(async () => {
    screen.getByRole("button", { name }).click();
  });
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FINALIZATION_POLL_MS);
  });
}

describe("FinalizationContainer", () => {
  it("reclama con POST, sondea el GET y muestra la versión publicada", async () => {
    const onPublished = vi.fn();
    fetchMock.mockResolvedValueOnce(json({ outcome: "claimed", ...op("manifest_ready") }, 201)).mockResolvedValueOnce(json(op("object_checked"))).mockResolvedValueOnce(json(op("published", 2)));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" onPublished={onPublished} />);

    await click(/^finalizar$/i);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/documents/doc-1/revisions/rev-1/finalization", expect.objectContaining({ method: "POST" })]);
    expect(screen.getByText(/manifiesto listo/i)).toBeInTheDocument();

    await tick();
    expect(screen.getByText(/archivo verificado/i)).toBeInTheDocument();
    await tick();
    expect(screen.getByText(/versión 2 publicada/i)).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("button", { name: /finalizar/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["CONFIRMATION_REJECTED", /rechazó/i],
    ["CONFIRMATIONS_MISSING", /faltan confirmaciones/i],
    ["DRAFT_CHANGED", /borrador cambió/i],
    ["REVISION_NOT_ACTIVE", /ya no está vigente/i],
    ["FINALIZATION_IN_PROGRESS", /finalización en curso/i],
    ["RECEIPTS_INCOMPLETE", /faltan constancias/i],
  ])("muestra un texto claro para %s y no sondea", async (code, text) => {
    fetchMock.mockResolvedValueOnce(json({ error: { code } }, 409));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" />);
    await click(/^finalizar$/i);
    expect(screen.getByText(text)).toBeInTheDocument();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /reanudar finalización/i })).toBeEnabled();
  });

  it("el sondeo tiene tope: termina en estado detenido y permite actualizar", async () => {
    fetchMock.mockResolvedValueOnce(json({ outcome: "claimed", ...op("manifest_ready") }, 201));
    fetchMock.mockImplementation(async () => json(op("manifest_ready")));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" />);
    await click(/^finalizar$/i);
    for (let i = 0; i < FINALIZATION_POLL_MAX_ATTEMPTS; i += 1) await tick();

    expect(screen.getByText(/sigue en curso/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1 + FINALIZATION_POLL_MAX_ATTEMPTS);
    await tick();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1 + FINALIZATION_POLL_MAX_ATTEMPTS);

    fetchMock.mockResolvedValueOnce(json(op("published", 3)));
    await click(/actualizar estado/i);
    expect(screen.getByText(/versión 3 publicada/i)).toBeInTheDocument();
  });
});
