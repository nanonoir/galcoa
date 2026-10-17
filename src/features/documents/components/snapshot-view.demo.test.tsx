import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { snapshotScenarios } from "@/mocks/documents";

import { SnapshotView } from "./snapshot-view";

// Interruptor de la demo encendido (valor real): ninguna advertencia ni estado de control visibles.
describe("SnapshotView · advertencias ocultas (demo)", () => {
  it.each(snapshotScenarios.filter((s) => s.state.status === "ready").map((s) => s.id))("%s: sin advertencias ni control", (id) => {
    const scenario = snapshotScenarios.find((s) => s.id === id)!;
    const { container } = render(<SnapshotView state={scenario.state} onRetry={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Advertencias" })).not.toBeInTheDocument();
    expect(screen.queryByText("Control", { selector: "dt" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/advertencia|contradicción|inconsistencias/i);
    expect(screen.getByText("Sello HCS", { selector: "dt" })).toBeInTheDocument();
  });
});
