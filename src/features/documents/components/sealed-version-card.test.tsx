import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SealedVersionView } from "@/lib/contracts/sealed-version-view";

import { SealedVersionCard } from "./sealed-version-card";

const DOC = "22222222-2222-4222-8222-222222222222";
const base: SealedVersionView = {
  documentId: DOC,
  revisionId: "rev-1",
  versionNumber: 3,
  reference: "ref-abc",
  documentHash: "ab".repeat(32),
  finalizedAt: "2026-10-17T12:30:00.000Z",
  seal: { status: "pendiente" },
};
const registered: SealedVersionView["seal"] = {
  status: "registrado",
  topicId: "0.0.1234",
  sequenceNumber: "7",
  transactionId: "0.0.99@1.1",
  consensusTimestamp: "1700000001.123456789",
};

const truncated = `${base.documentHash.slice(0, 10)}…${base.documentHash.slice(-8)}`;

function detailsOf() {
  return screen.getByText("Detalles técnicos").closest("details") as HTMLElement;
}

/** Texto visible fuera de los desplegables de la tarjeta. */
function outsideDetailsText() {
  const card = screen.getByTestId("sealed-version-card").cloneNode(true) as HTMLElement;
  card.querySelectorAll("details").forEach((node) => node.remove());
  return card.textContent ?? "";
}

describe("SealedVersionCard · detalles técnicos", () => {
  it("registrado: el valor de la huella, Topic/Secuencia y HashScan quedan dentro del desplegable", () => {
    render(<SealedVersionCard version={{ ...base, seal: registered }} onCopy={vi.fn()} onRetry={vi.fn()} />);
    const details = detailsOf();
    expect(details).toHaveTextContent("Topic 0.0.1234 · Secuencia 7");
    expect(within(details).getByText(truncated)).toHaveClass("tech-id");
    expect(within(details).getByRole("link", { name: "Ver en HashScan" })).toHaveAttribute(
      "href",
      "https://hashscan.io/testnet/transaction/1700000001.123456789",
    );
    expect(screen.getByRole("link", { name: "Ver verificación" })).toHaveAttribute("href", "/verify/ref-abc");
  });

  it("registrado: fuera del desplegable no queda lenguaje técnico", () => {
    render(<SealedVersionCard version={{ ...base, seal: registered }} onCopy={vi.fn()} onRetry={vi.fn()} />);
    expect(outsideDetailsText()).not.toMatch(/sello hcs|hash|topic|snapshot/i);
    expect(outsideDetailsText()).toContain("Registro en Hedera");
    expect(screen.getByText("Huella digital")).toBeInTheDocument();
  });

  it("copia la huella y lo anuncia con el nombre actualizado", async () => {
    const onCopy = vi.fn();
    render(<SealedVersionCard version={{ ...base, seal: registered }} onCopy={onCopy} onRetry={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copiar huella digital" }));
    expect(onCopy).toHaveBeenCalledWith(base.documentHash);
    expect(await screen.findByText("Huella copiada al portapapeles")).toBeInTheDocument();
  });

  it("pendiente: también agrupa el valor de la huella en el desplegable", () => {
    render(<SealedVersionCard version={base} onCopy={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText("Huella digital")).toBeInTheDocument();
    expect(detailsOf()).toHaveTextContent(truncated);
    expect(outsideDetailsText()).not.toMatch(/sello hcs|hash|topic|snapshot/i);
  });
});

describe("SealedVersionCard · PDF final", () => {
  it.each([
    ["registrado", registered],
    ["pendiente", { status: "pendiente" }],
    ["no_iniciado", { status: "no_iniciado" }],
    ["fallido", { status: "fallido" }],
  ] as const)("ofrece la descarga del PDF final con sello %s, sin depender del registro", (_name, seal) => {
    render(<SealedVersionCard version={{ ...base, seal }} onCopy={vi.fn()} onRetry={vi.fn()} />);
    const link = screen.getByRole("link", { name: /descargar pdf final \(versión 3\)/i });
    expect(link).toHaveAttribute("href", `/api/documents/${DOC}/versions/3/pdf`);
    expect(link).toHaveAttribute("download");
  });

  it("explica que el archivo es inmutable y no se regenera", () => {
    render(<SealedVersionCard version={base} onCopy={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/inmutable de esta versión; no se vuelve a generar/i)).toBeInTheDocument();
  });
});
