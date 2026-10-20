import { render, screen } from "@testing-library/react";
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
