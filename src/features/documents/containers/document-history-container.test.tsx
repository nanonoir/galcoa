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

  it("error: reintentar vuelve a pedir los datos al servidor", async () => {
    render(<DocumentHistoryContainer state={{ status: "error", message: "No se pudo cargar." }} />);
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
