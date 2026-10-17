import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { dashboardScenarios } from "@/mocks/dashboard";

import { PreviewApp } from "./preview-app";

describe("PreviewApp", () => {
  it("declara datos ficticios y expone todos los escenarios compartidos", () => {
    render(<PreviewApp />);
    expect(screen.getByRole("note")).toHaveTextContent("Datos ficticios");
    const group = screen.getByRole("group", { name: "Escenario" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(dashboardScenarios.map((s) => s.label));
  });

  it("cambia de escenario y refleja la selección con aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PreviewApp />);
    const group = screen.getByRole("group", { name: "Escenario" });
    expect(within(group).getByRole("button", { name: "Cargando" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(group).getByRole("button", { name: "Lista vacía" }));
    expect(within(group).getByRole("button", { name: "Lista vacía" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("preview-stage")).getByText(/Todavía no hay documentos/)).toBeInTheDocument();
  });

  it("los callbacks solo registran eventos locales, sin red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<PreviewApp />);
    const events = screen.getByRole("complementary");
    expect(within(events).getByText("Sin eventos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear documento" }));
    await user.click(screen.getByRole("button", { name: "Error técnico recuperable" }));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(within(events).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["onRetry()", "onCreate()"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
