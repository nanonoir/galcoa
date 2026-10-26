import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SealedVersionView } from "@/lib/contracts/sealed-version-view";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SealedVersionContainer } from "./sealed-version-container";

const HASH = "ab".repeat(32);
const base: SealedVersionView = {
  documentId: "doc-1",
  revisionId: "rev-1",
  versionNumber: 2,
  reference: "ref-abc",
  documentHash: HASH,
  finalizedAt: "2026-10-17T12:30:00.000Z",
  seal: { status: "pendiente" },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  router.refresh.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SealedVersionContainer", () => {
  it("registrado: título, versión, huella truncada con Copiar, Topic/Secuencia y enlaces correctos", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <SealedVersionContainer
        version={{ ...base, seal: { status: "registrado", topicId: "0.0.1234", sequenceNumber: "7", transactionId: "0.0.99@1.1", consensusTimestamp: "1700000001.123456789" } }}
      />,
    );

    expect(screen.getByText("Versión finalizada. Huella registrada en Hedera Testnet.")).toBeInTheDocument();
    expect(screen.getByText(/versión 2 quedó finalizada/i)).toBeInTheDocument();
    expect(screen.getByText(/Topic 0\.0\.1234 · Secuencia 7/)).toBeInTheDocument();
    expect(screen.getByText(`${HASH.slice(0, 10)}…${HASH.slice(-8)}`)).toHaveClass("tech-id");
    expect(screen.getByRole("link", { name: /ver verificación/i })).toHaveAttribute("href", "/verify/ref-abc");
    const hashscan = screen.getByRole("link", { name: /hashscan/i });
    expect(hashscan).toHaveAttribute("href", "https://hashscan.io/testnet/transaction/1700000001.123456789");
    expect(hashscan).toHaveAttribute("target", "_blank");
    expect(hashscan).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /copiar huella/i }));
    expect(writeText).toHaveBeenCalledWith(HASH);
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });

  it("pendiente: ofrece Reintentar registro, hace POST idempotente a la finalización de la revisión y refresca", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    render(<SealedVersionContainer version={base} />);

    expect(screen.getByText("Versión finalizada. Huella pendiente.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /hashscan/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar registro/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/revisions/rev-1/finalization", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("si el reintento falla lo dice y no afirma registro", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "TECHNICAL_FAILURE" } }), { status: 503 }));
    render(<SealedVersionContainer version={{ ...base, seal: { status: "fallido" } }} />);
    expect(screen.getByText(/último intento de registro no se completó/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar registro/i }));
    expect(await screen.findByText(/no se pudo reintentar el registro/i)).toBeInTheDocument();
    expect(screen.queryByText("Versión finalizada. Huella registrada en Hedera Testnet.")).not.toBeInTheDocument();
  });
});
