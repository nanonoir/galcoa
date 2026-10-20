import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentHistoryContainer } from "./document-history-container";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => vi.clearAllMocks());

describe("DocumentHistoryContainer (MVP-116/I3)", () => {
  it("historial vacío: no inventa versiones", () => {
    render(<DocumentHistoryContainer state={{ status: "ready", versions: [] }} />);
    expect(screen.queryByRole("button", { name: /v\d/i })).not.toBeInTheDocument();
  });

  it("versiones reales: las lista con la más reciente primero y el sello separado", () => {
    const base = { revisionId: "22222222-2222-4222-8222-222222222222", snapshotId: "33333333-3333-4333-8333-333333333333", finalizedAt: "2026-10-17T12:30:00.000Z" };
    render(
      <DocumentHistoryContainer
        state={{
          status: "ready",
          versions: [
            { ...base, versionId: "11111111-1111-4111-8111-111111111111", number: 1, previousVersionId: null, hcsStatus: "registrado" },
            { ...base, versionId: "44444444-4444-4444-8444-444444444444", number: 2, previousVersionId: "11111111-1111-4111-8111-111111111111", hcsStatus: "fallido" },
          ],
        }}
      />,
    );
    const items = screen.getAllByRole("button", { name: /^Versión \d/ });
    expect(items.map((b) => b.textContent)).toEqual([expect.stringContaining("Versión 2"), expect.stringContaining("Versión 1")]);
    expect(screen.queryByText(/Todavía no hay versiones finalizadas/)).not.toBeInTheDocument();
  });

  it("error: reintentar vuelve a pedir los datos al servidor", async () => {
    render(<DocumentHistoryContainer state={{ status: "error", message: "No se pudo cargar." }} />);
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
