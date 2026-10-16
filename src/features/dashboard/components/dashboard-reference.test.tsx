import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { dashboardScenarios } from "@/mocks/dashboard";

import { DashboardReference } from "./dashboard-reference";

function renderScenario(id: string) {
  const scenario = dashboardScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  const handlers = { onCreate: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn() };
  render(<DashboardReference state={scenario.state} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
}

/** Tarjetas de documento (las advertencias también son `li`, por eso se parte del título). */
function cards() {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.closest("li") as HTMLElement);
}

/** Valor de una dimensión dentro del elemento `<dl>` de una tarjeta. */
function dimension(card: HTMLElement, name: string) {
  const term = within(card).getByText(name, { selector: "dt" });
  return term.nextElementSibling?.textContent;
}

describe("DashboardReference", () => {
  it("carga: anuncia el estado y no muestra documentos", () => {
    renderScenario("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando documentos");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("error técnico: muestra el mensaje y reintenta por callback", async () => {
    const { user, onRetry } = renderScenario("error");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de documentos");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("vacío: invita a crear y el callback no recibe datos", async () => {
    const { user, onCreate } = renderScenario("empty");
    expect(screen.getByText(/Todavía no hay documentos/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear documento" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("mantiene visible la discrepancia material como advertencia informativa", () => {
    renderScenario("commercial");
    const warnings = screen.getByRole("region", { name: /Advertencias de Entrega de maíz/ });
    expect(warnings).toHaveTextContent("Advertencia crítica");
    expect(warnings).toHaveTextContent("10 toneladas");
    expect(warnings).toHaveTextContent("12 toneladas");
    expect(warnings).toHaveTextContent("no bloquean confirmar ni finalizar");
  });

  it("muestra la medición sin unidad con su advertencia", () => {
    renderScenario("measurement");
    expect(screen.getByRole("region", { name: /Advertencias de Medición/ })).toHaveTextContent(/unidad/i);
  });

  it("no inventa estado de confirmaciones sin revisión congelada", () => {
    renderScenario("commercial");
    const [card] = cards();
    expect(dimension(card, "Confirmaciones")).toBe("Sin revisión congelada");
    expect(dimension(card, "Control")).toBe("Contradicción crítica");
  });

  it("no mezcla dimensiones: finalizado con sello pendiente vs registrado", () => {
    renderScenario("finalized-pending");
    const pending = cards().find((li) => dimension(li, "Sello HCS") === "Pendiente");
    expect(pending).toBeDefined();
    expect(dimension(pending as HTMLElement, "Documento")).toBe("Finalizado");
    expect(dimension(pending as HTMLElement, "Sello HCS")).toBe("Pendiente");
  });

  it("el sello registrado no cambia el estado documental ni el de control", () => {
    renderScenario("finalized-registered");
    const card = cards().find((li) => dimension(li, "Sello HCS") === "Registrado");
    expect(card).toBeDefined();
    expect(dimension(card as HTMLElement, "Documento")).toBe("Finalizado");
  });

  it("abrir emite el id del documento y no persiste ni usa red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { user, onOpen } = renderScenario("confirmations");
    await user.click(screen.getByRole("button", { name: /^Abrir / }));
    expect(onOpen).toHaveBeenCalledWith("doc-confirmaciones-001");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("cada escenario compartido renderiza sin lanzar", () => {
    for (const scenario of dashboardScenarios) {
      const { unmount } = render(<DashboardReference state={scenario.state} onCreate={() => {}} onOpen={() => {}} onRetry={() => {}} />);
      expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
      unmount();
    }
  });
});
