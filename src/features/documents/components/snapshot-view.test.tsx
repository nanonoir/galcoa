import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SnapshotViewState } from "@/lib/contracts/snapshot-view";
import { snapshotScenarios } from "@/mocks/documents";

import { SnapshotView } from "./snapshot-view";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

type ReadyState = Extract<SnapshotViewState, { status: "ready" }>;

function scenarioState(id: string): SnapshotViewState {
  const scenario = snapshotScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.state;
}

/** Estado `ready` de un escenario, para derivar casos negativos sin fixtures nuevos. */
function readyState(id: string): ReadyState {
  const state = scenarioState(id);
  if (state.status !== "ready") throw new Error(`El escenario ${id} no es ready`);
  return state;
}

function renderState(state: SnapshotViewState) {
  const onRetry = vi.fn();
  const view = render(<SnapshotView state={state} onRetry={onRetry} />);
  return { ...view, onRetry, user: userEvent.setup() };
}

function renderScenario(id: string) {
  return renderState(scenarioState(id));
}

/** Valor de una dimensión dentro del `<dl>` de estados. */
function dimension(name: string) {
  const list = screen.getByLabelText("Estado del snapshot");
  const term = within(list).getByText(name, { selector: "dt" });
  return term.nextElementSibling?.textContent;
}

function warningsSection() {
  return screen.getByRole("region", { name: "Advertencias" });
}

const forbiddenClaims = /certificad|validado regulatoriamente|garantizad|firma digital|identidad verificada|verdader/i;
const forbiddenActions = /confirmar|rechazar|congelar|finalizar/i;

describe("SnapshotView", () => {
  it("cubre exactamente los siete escenarios del contrato", () => {
    expect(snapshotScenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "critical-two-sources",
      "unit-missing",
      "no-warnings",
      "long-content",
    ]);
  });

  it("carga: anuncia el estado con texto visible y no muestra contenido, vacío ni error", () => {
    renderScenario("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando la versión congelada");
    expect(screen.queryByRole("region", { name: "Contenido" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay una revisión congelada/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error técnico: muestra el mensaje y «Reintentar» invoca solo onRetry", async () => {
    const { user, onRetry } = renderScenario("error");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar la versión congelada");
    expect(alert).toHaveTextContent("No se pudo cargar la revisión. Intenta nuevamente.");
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("vacío: distingue la ausencia de revisión congelada de la carga y del error", () => {
    renderScenario("empty");
    expect(screen.getByText("Todavía no hay una revisión congelada.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("contradicción crítica: ambas fuentes visibles con alias y descripción, severidad por texto", () => {
    renderScenario("critical-two-sources");
    const section = warningsSection();
    const card = within(section).getByText("Crítica:").closest("li") as HTMLElement;
    expect(card).toHaveTextContent("Se declararon 10 toneladas entregadas, pero otra fuente menciona 12 toneladas.");
    const sources = within(card).getAllByRole("listitem").map((li) => li.textContent);
    expect(sources).toEqual(["Fuente A: mensaje del autor: 10 toneladas", "Fuente B: remito aportado: 12 toneladas"]);
    for (const source of within(card).getAllByRole("listitem")) expect(source).toBeVisible();
    expect(dimension("Control")).toBe("Contradicción crítica");
  });

  it("contradicción crítica: el contenido conserva ambas cifras sin elegir una", () => {
    renderScenario("critical-two-sources");
    const content = screen.getByRole("region", { name: "Contenido" });
    expect(content).toHaveTextContent(/10 toneladas.*12 toneladas/);
    expect(content).toHaveTextContent("Participantes seleccionados: Autor, Comprador");
  });

  it("estados separados: documento, control, confirmaciones y sello HCS por separado", () => {
    renderScenario("critical-two-sources");
    expect(dimension("Documento")).toBe("Esperando confirmaciones");
    expect(dimension("Control")).toBe("Contradicción crítica");
    expect(dimension("Confirmaciones")).toBe("Parcial");
    expect(dimension("Registro en Hedera")).toBe("No iniciado");
  });

  it("unidad ausente: advertencia no crítica, sin inventar la unidad, y correcciones listadas", () => {
    renderScenario("unit-missing");
    const card = within(warningsSection()).getByText("Advertencia:").closest("li") as HTMLElement;
    expect(card).toHaveTextContent("Se registró una medición de 7 sin unidad indicada.");
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Fuente A: mensaje del autor: «humedad 7»",
    ]);
    expect(within(warningsSection()).queryByText("Crítica:")).not.toBeInTheDocument();
    expect(screen.getByText("Se corrigió «humedd» por «humedad».")).toBeInTheDocument();
    expect(screen.queryByText(/\b7\s?(%|g|kg|ppm)/)).not.toBeInTheDocument();
  });

  it("sin advertencias: lo dice y aclara que no detectar inconsistencias no es corroborar", () => {
    renderScenario("no-warnings");
    expect(within(warningsSection()).getByText("Este snapshot no tiene advertencias registradas.")).toBeInTheDocument();
    expect(dimension("Control")).toBe("Sin inconsistencias críticas detectadas");
    expect(screen.getByText(/no significa que los datos estén corroborados/)).toBeInTheDocument();
  });

  it("aclara que el contenido está congelado y que los estados son el avance actual, sin llamarlos históricos", () => {
    renderScenario("no-warnings");
    expect(screen.getByText(/contenido de abajo está congelado y no cambia/i)).toBeInTheDocument();
    expect(screen.getByText(/muestran el avance actual y pueden cambiar después de congelar/i)).toBeInTheDocument();
    expect(screen.queryByText(/histór/i)).not.toBeInTheDocument();
  });

  it("contenido extenso: muestra el texto completo, sin truncar ninguna cláusula", () => {
    const state = readyState("long-content");
    renderState(state);
    const body = screen.getByRole("region", { name: "Contenido" });
    for (let i = 1; i <= 8; i++) expect(body).toHaveTextContent(`Cláusula ${i}:`);
    expect(body.textContent).toContain(state.content.operation.body.replace(/\n+/g, "").slice(0, 40));
  });

  it("todos los escenarios: sin botones de confirmar, rechazar, congelar ni finalizar", () => {
    for (const scenario of snapshotScenarios) {
      const { unmount } = renderState(scenario.state);
      for (const button of screen.queryAllByRole("button")) {
        expect(button.textContent ?? "", scenario.id).not.toMatch(forbiddenActions);
      }
      unmount();
    }
  });

  it("todos los escenarios: sin ids internos, enlaces ni expresiones prohibidas", () => {
    for (const scenario of snapshotScenarios) {
      const { container, unmount } = renderState(scenario.state);
      const text = container.textContent ?? "";
      expect(text, scenario.id).not.toMatch(forbiddenClaims);
      if (scenario.state.status === "ready") {
        expect(text, scenario.id).not.toContain(scenario.state.revisionId);
        expect(text, scenario.id).not.toContain(scenario.state.snapshotId);
        for (const warning of scenario.state.content.warnings) expect(text, scenario.id).not.toContain(warning.id);
      }
      expect(container.querySelector("a")).toBeNull();
      unmount();
    }
  });

  it("negativo: una advertencia crítica no deshabilita «Reintentar» ni ninguna otra acción", async () => {
    // El error real no trae advertencias; se comprueba que ningún botón de la vista crítica esté deshabilitado
    // y que el reintento del estado de error siga operativo con teclado.
    renderScenario("critical-two-sources");
    for (const button of screen.queryAllByRole("button")) expect(button).toBeEnabled();

    const { user, onRetry } = renderScenario("error");
    const retry = screen.getByRole("button", { name: "Reintentar" });
    expect(retry).toBeEnabled();
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("negativo: una fuente ausente se informa como no informada, sin inventarla", () => {
    const base = readyState("unit-missing");
    const state: ReadyState = {
      ...base,
      content: {
        ...base.content,
        warnings: base.content.warnings.map((w) => ({ ...w, sources: [] })),
      },
    };
    renderState(state);
    const card = within(warningsSection()).getByText("Advertencia:").closest("li") as HTMLElement;
    expect(card).toHaveTextContent("Fuentes");
    expect(card).toHaveTextContent("No informadas.");
    expect(within(card).queryByText(/Fuente [A-Z]/)).not.toBeInTheDocument();
  });

  it("negativo: un estado de confirmaciones ausente (`null`) no se muestra como «Completa»", () => {
    const base = readyState("no-warnings");
    const state = { ...base, confirmationStatus: null } as unknown as ReadyState;
    renderState(state);
    expect(dimension("Confirmaciones")).toBe("Sin revisión congelada");
  });

  it("texto seguro: el contenido con marcado se muestra como texto, nunca como HTML", () => {
    const base = readyState("no-warnings");
    const state: ReadyState = {
      ...base,
      content: {
        ...base.content,
        operation: { ...base.content.operation, body: '<img src=x onerror="alert(1)"><b>negrita</b>' },
      },
    };
    const { container } = renderState(state);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)"><b>negrita</b>')).toBeInTheDocument();
  });

  it("nombres accesibles: región titulada, encabezados y lista de estados etiquetada", () => {
    renderScenario("critical-two-sources");
    expect(screen.getByRole("region", { name: "Snapshot congelado" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /Entrega de maíz/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Estado del snapshot").tagName).toBe("DL");
  });
});
