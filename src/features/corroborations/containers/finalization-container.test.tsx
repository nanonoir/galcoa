import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  FINALIZATION_POLL_MAX_ATTEMPTS,
  FINALIZATION_POLL_MS,
  FinalizationContainer,
  SEAL_RETRY_MAX_ATTEMPTS,
  SEAL_RETRY_MS,
} from "./finalization-container";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const op = (phase: string, versionNumber: number | null = null) => ({ operation: { operationId: "op-1", phase, status: "active", versionNumber } });
const SEAL = {
  status: "registrado",
  reference: "ref-abc",
  topicId: "0.0.1234",
  sequenceNumber: "7",
  transactionId: "0.0.99@1700000000.000000001",
  consensusTimestamp: "1700000001.123456789",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockClear();
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
async function tick(ms = FINALIZATION_POLL_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("FinalizationContainer", () => {
  it("reclama con POST, sondea el GET y termina con el sello registrado y sus enlaces", async () => {
    const onPublished = vi.fn();
    fetchMock
      .mockResolvedValueOnce(json({ outcome: "claimed", ...op("manifest_ready") }, 201))
      .mockResolvedValueOnce(json(op("object_checked")))
      .mockResolvedValueOnce(json(op("published", 2)))
      .mockResolvedValueOnce(json({ outcome: "replayed", ...op("published", 2), seal: SEAL }));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" onPublished={onPublished} />);

    await click(/^finalizar y registrar huella$/i);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/documents/doc-1/revisions/rev-1/finalization", expect.objectContaining({ method: "POST" })]);
    expect(screen.getByRole("status")).toHaveTextContent("Generando el PDF…");

    await tick();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("Registrando la huella en Hedera…");
    // La descarga del PDF ya está disponible con la huella todavía pendiente.
    expect(screen.getByRole("link", { name: /descargar pdf final \(versión 2\)/i })).toHaveAttribute("href", "/api/documents/doc-1/versions/2/pdf");
    expect(onPublished).not.toHaveBeenCalled();

    await tick(SEAL_RETRY_MS);
    expect(fetchMock.mock.calls[3]).toEqual(["/api/documents/doc-1/revisions/rev-1/finalization", expect.objectContaining({ method: "POST" })]);
    expect(screen.getByText("Versión finalizada. Huella registrada en Hedera Testnet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver verificación/i })).toHaveAttribute("href", "/verify/ref-abc");
    const hashscan = screen.getByRole("link", { name: /hashscan/i });
    expect(hashscan).toHaveAttribute("href", "https://hashscan.io/testnet/transaction/1700000001.123456789");
    expect(hashscan).toHaveAttribute("target", "_blank");
    expect(hashscan).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/0\.0\.1234/)).toBeInTheDocument();
    const pdfLinks = screen.getAllByRole("link", { name: /descargar pdf final/i });
    expect(pdfLinks).toHaveLength(1);
    expect(pdfLinks[0]).toHaveAttribute("href", "/api/documents/doc-1/versions/2/pdf");
    expect(onPublished).toHaveBeenCalledWith(2);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /finalizar y registrar huella/i })).not.toBeInTheDocument();
  });

  it("si el POST ya devuelve el sello registrado, termina sin reintentos", async () => {
    fetchMock.mockResolvedValueOnce(json({ outcome: "claimed", ...op("published", 1), seal: SEAL }, 201));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" />);
    await click(/^finalizar y registrar huella$/i);
    expect(screen.getByText(/huella registrada en hedera testnet/i)).toBeInTheDocument();
    await tick(SEAL_RETRY_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // El recuadro no desaparece solo tras `done`: lo reemplaza la tarjeta persistente del servidor.
    expect(screen.getByText("Versión finalizada. Huella registrada en Hedera Testnet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hashscan/i })).toBeInTheDocument();
  });

  it("con el sello pendiente reintenta el POST con tope y termina detenido, con opción de reintentar", async () => {
    fetchMock.mockImplementation(async () => json({ outcome: "replayed", ...op("published", 1), seal: { status: "pendiente" } }));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" />);
    await click(/^finalizar y registrar huella$/i);
    expect(screen.getByRole("status")).toHaveTextContent("Registrando la huella en Hedera…");

    for (let i = 0; i < SEAL_RETRY_MAX_ATTEMPTS; i += 1) await tick(SEAL_RETRY_MS);
    expect(screen.getByText(/sigue en curso/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1 + SEAL_RETRY_MAX_ATTEMPTS);
    await tick(SEAL_RETRY_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1 + SEAL_RETRY_MAX_ATTEMPTS);
    expect(router.refresh).not.toHaveBeenCalled();

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ outcome: "replayed", ...op("published", 1), seal: SEAL }));
    await click(/^reintentar$/i);
    expect(screen.getByText(/huella registrada en hedera testnet/i)).toBeInTheDocument();
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
    await click(/^finalizar y registrar huella$/i);
    expect(screen.getByText(text)).toBeInTheDocument();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^reintentar$/i })).toBeEnabled();
  });

  it("el sondeo tiene tope: termina en estado detenido y permite actualizar", async () => {
    fetchMock.mockResolvedValueOnce(json({ outcome: "claimed", ...op("manifest_ready") }, 201));
    fetchMock.mockImplementation(async () => json(op("manifest_ready")));
    render(<FinalizationContainer documentId="doc-1" revisionId="rev-1" />);
    await click(/^finalizar y registrar huella$/i);
    for (let i = 0; i < FINALIZATION_POLL_MAX_ATTEMPTS; i += 1) await tick();

    expect(screen.getByText(/sigue en curso/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1 + FINALIZATION_POLL_MAX_ATTEMPTS);
    await tick();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1 + FINALIZATION_POLL_MAX_ATTEMPTS);

    fetchMock.mockResolvedValueOnce(json(op("published", 3)));
    await click(/actualizar estado/i);
    expect(screen.getByRole("status")).toHaveTextContent("Registrando la huella en Hedera…");
  });
});
