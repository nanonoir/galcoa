import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { dashboardScenarios } from "@/mocks/dashboard";

import { DashboardReference } from "./dashboard-reference";

// Interruptor de la demo encendido (valor real): sin advertencias ni estado de control en las tarjetas.
describe("DashboardReference · advertencias ocultas (demo)", () => {
  it.each(dashboardScenarios.filter((s) => s.state.status === "ready").map((s) => s.id))("%s: sin advertencias ni control", (id) => {
    const scenario = dashboardScenarios.find((s) => s.id === id)!;
    const { container } = render(<DashboardReference state={scenario.state} onCreate={vi.fn()} onOpen={vi.fn()} onRetry={vi.fn()} />);
    expect(container.textContent).not.toMatch(/advertencia|contradicción|inconsistencias/i);
    expect(container.querySelector("dt")?.textContent).not.toBe("Control");
    expect(Array.from(container.querySelectorAll("dt")).map((dt) => dt.textContent)).not.toContain("Control");
  });
});
