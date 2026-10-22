import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DashboardViewState } from "@/lib/contracts/dashboard";
import { dashboardScenarios } from "@/mocks/dashboard";

import { DashboardReference } from "./dashboard-reference";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

function scenarioState(id: string): DashboardViewState {
  const scenario = dashboardScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.state;
}

function renderState(state: DashboardViewState) {
  const handlers = { onCreate: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn() };
  render(<DashboardReference state={state} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
}

function renderScenario(id: string) {
  return renderState(scenarioState(id));
}

/** Documentos de un escenario `ready`, para derivar casos negativos sin fixtures nuevos. */
function readyDocuments(id: string) {
  const state = scenarioState(id);
  if (state.status !== "ready") throw new Error(`El escenario ${id} no es ready`);
  return state.documents;
}

/** Tarjetas de documento (las advertencias también son `li`, por eso se parte del título). */
function cards() {
  return within(screen.getByRole("list", { name: "Documentos" })).getAllByRole("heading", { level: 3 }).map((h) => h.closest("li") as HTMLElement);
}

/** Valor de una dimensión dentro del elemento `<dl>` de una tarjeta. */
function dimension(card: HTMLElement, name: string) {
  const term = within(card).getByText(name, { selector: "dt" });
  return term.nextElementSibling?.textContent;
}

const forbiddenClaims = /certificad|validado regulatoriamente|garantizad|firma digital|identidad verificada|verdader/i;

describe("DashboardReference", () => {
  it("carga: anuncia el estado con texto visible y no muestra documentos ni vacío", () => {
    renderScenario("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando documentos");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay documentos/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error técnico: muestra el mensaje y reintenta solo por su callback", async () => {
    const { user, onRetry, onCreate, onOpen } = renderScenario("error");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar los documentos");
    expect(alert).toHaveTextContent("No se pudo cargar la lista de documentos");
    expect(screen.queryByText(/Todavía no hay documentos/)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("vacío: distinto de carga y error; crear invoca solo su callback, sin datos", async () => {
    const { user, onCreate, onOpen, onRetry } = renderScenario("empty");
    expect(screen.getByText(/Todavía no hay documentos/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Documentos" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear documento" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("vacío que enseña: muestra los 3 pasos y «Contar mi primera entrega» llama a onCreate", async () => {
    const { user, onCreate } = renderScenario("empty");
    expect(screen.getByText("Registrá tu primera entrega en 3 pasos:")).toBeInTheDocument();
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Contala por chat y adjuntá el remito.");
    expect(steps[1]).toHaveTextContent("Pedí la confirmación del comercio con un enlace o QR.");
    expect(steps[2]).toHaveTextContent("Quedá respaldado: se genera el PDF y se registra una huella que permite comprobar que no cambió.");
    await user.click(screen.getByRole("button", { name: "Contar mi primera entrega" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  describe("Primeros pasos", () => {
    const stepItems = () => within(screen.getByRole("heading", { name: "Primeros pasos" }).closest("[data-slot=card]") as HTMLElement).getAllByRole("listitem");

    it("sin documentos no aparece la tarjeta sino el estado vacío", () => {
      renderScenario("empty");
      expect(screen.queryByRole("heading", { name: "Primeros pasos" })).not.toBeInTheDocument();
      expect(screen.getByText(/Todavía no hay documentos/)).toBeInTheDocument();
    });

    it("con confirmación en curso: 2 de 3 hechos", () => {
      renderScenario("confirmations");
      const items = stepItems();
      expect(items[0]).toHaveTextContent("Contar una entrega");
      expect(items[0]).toHaveTextContent("hecho");
      expect(items[1]).toHaveTextContent("Pedir la confirmación");
      expect(items[1]).toHaveTextContent("hecho");
      expect(items[2]).toHaveTextContent("Quedar respaldado");
      expect(items[2]).toHaveTextContent("pendiente");
    });

    it("solo un borrador: 1 de 3 hechos", () => {
      renderScenario("measurement");
      const items = stepItems();
      expect(items[0]).toHaveTextContent("hecho");
      expect(items[1]).toHaveTextContent("pendiente");
      expect(items[2]).toHaveTextContent("pendiente");
    });

    it("con un documento finalizado la tarjeta se oculta", () => {
      renderScenario("finalized-registered");
      expect(screen.queryByRole("heading", { name: "Primeros pasos" })).not.toBeInTheDocument();
    });
  });

  describe("Te falta", () => {
    it("lista los pendientes del más viejo al más nuevo y «Abrir» llama a onOpen", async () => {
      const documents = [
        ...readyDocuments("finalized-pending"),
        ...readyDocuments("confirmations"),
        ...readyDocuments("finalized-registered"),
      ];
      const { user, onOpen } = renderState({ status: "ready", documents });
      const list = screen.getByRole("list", { name: "Te falta" });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Venta de trigo");
      expect(items[0]).toHaveTextContent("Esperando confirmaciones");
      expect(items[1]).toHaveTextContent("Entrega de soja");
      expect(items[1]).toHaveTextContent("Registro en Hedera pendiente");
      await user.click(within(items[1]).getByRole("button", { name: /Abrir/ }));
      expect(onOpen).toHaveBeenCalledWith("doc-finalizado-pendiente-001");
    });

    it("revisión rechazada muestra su motivo", () => {
      const [base] = readyDocuments("confirmations");
      renderState({ status: "ready", documents: [{ ...base, documentStatus: "revision_rechazada", confirmationStatus: "rechazada" }] });
      expect(screen.getByRole("list", { name: "Te falta" })).toHaveTextContent("Revisión rechazada: corregí y pedí una nueva confirmación");
    });

    it("sin pendientes no se muestra", () => {
      renderScenario("finalized-registered");
      expect(screen.queryByRole("heading", { name: "Te falta" })).not.toBeInTheDocument();
      renderScenario("measurement");
      expect(screen.queryByRole("heading", { name: "Te falta" })).not.toBeInTheDocument();
    });
  });

  it("lista: título, fecha legible con su ISO y recuento", () => {
    renderScenario("confirmations");
    expect(screen.getByRole("list", { name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByText(/1 documento$/)).toBeInTheDocument();
    const [card] = cards();
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent("Venta de trigo — Contrato 22 (ficticio)");
    const time = card.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-03-12T16:45:00.000Z");
    expect(time?.textContent).toMatch(/2026.*UTC$/);
  });

  it("mantiene visible la discrepancia material con sus fuentes como advertencia informativa", () => {
    renderScenario("commercial");
    const warnings = screen.getByRole("region", { name: /Advertencias de Entrega de maíz/ });
    expect(warnings).toHaveTextContent("Advertencia crítica");
    expect(warnings).toHaveTextContent("10 toneladas");
    expect(warnings).toHaveTextContent("12 toneladas");
    expect(warnings).toHaveTextContent("Fuentes: msg-0003, msg-0007");
    expect(warnings).toHaveTextContent("no bloquean confirmar ni finalizar");
  });

  it("la advertencia crítica no deshabilita acciones", async () => {
    const { user, onOpen, onCreate } = renderScenario("commercial");
    const open = screen.getByRole("button", { name: /^Abrir Entrega de maíz/ });
    const create = screen.getByRole("button", { name: "Crear documento" });
    expect(open).toBeEnabled();
    expect(create).toBeEnabled();
    await user.click(open);
    expect(onOpen).toHaveBeenCalledWith("doc-comercial-001");
    await user.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("muestra la medición sin unidad con su advertencia y su fuente", () => {
    renderScenario("measurement");
    const warnings = screen.getByRole("region", { name: /Advertencias de Medición/ });
    expect(warnings).toHaveTextContent(/unidad/i);
    expect(warnings).toHaveTextContent("Fuentes: msg-0002");
    expect(dimension(cards()[0], "Documento")).toBe("Borrador");
  });

  it("no inventa estado de confirmaciones sin revisión congelada", () => {
    renderScenario("commercial");
    const [card] = cards();
    expect(dimension(card, "Confirmaciones")).toBe("Sin revisión congelada");
    expect(dimension(card, "Confirmaciones")).not.toBe("Completa");
    expect(dimension(card, "Control")).toBe("Contradicción crítica");
    expect(within(card).queryByText(/^Revisión rev-/)).not.toBeInTheDocument();
  });

  it("confirmaciones parciales identifican la revisión y el snapshot a los que se refieren", () => {
    renderScenario("confirmations");
    const [card] = cards();
    expect(dimension(card, "Documento")).toBe("Esperando confirmaciones");
    expect(dimension(card, "Confirmaciones")).toBe("Parcial");
    expect(dimension(card, "Registro en Hedera")).toBe("No iniciado");
    expect(card).toHaveTextContent("Revisión rev-confirmaciones-001-2");
    expect(card).toHaveTextContent("Versión congelada snap-confirmaciones-001-2");
    expect(within(card).getByText("Detalles técnicos")).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/snapshot|hash|Sello HCS|Topic|contraste/i);
  });

  it("no mezcla dimensiones: finalizado con sello pendiente vs registrado", () => {
    renderScenario("finalized-pending");
    const pending = cards().find((li) => dimension(li, "Registro en Hedera") === "Pendiente");
    expect(pending).toBeDefined();
    expect(dimension(pending as HTMLElement, "Documento")).toBe("Finalizado");
    expect(dimension(pending as HTMLElement, "Confirmaciones")).toBe("Completa");
    expect(dimension(pending as HTMLElement, "Registro en Hedera")).toBe("Pendiente");
  });

  it("el sello registrado no cambia el estado documental ni el de control", () => {
    renderScenario("finalized-registered");
    const card = cards().find((li) => dimension(li, "Registro en Hedera") === "Registrado");
    expect(card).toBeDefined();
    expect(dimension(card as HTMLElement, "Documento")).toBe("Finalizado");
    expect(dimension(card as HTMLElement, "Control")).toBe("Sin inconsistencias críticas detectadas");
  });

  it("abrir emite el id del documento y no persiste ni usa red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { user, onOpen, onCreate, onRetry } = renderScenario("confirmations");
    await user.click(screen.getByRole("button", { name: /^Abrir (?!pendiente)/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("doc-confirmaciones-001");
    expect(onCreate).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("teclado: crear y abrir se alcanzan con Tab y se activan con Enter", async () => {
    const { user, onCreate, onOpen } = renderScenario("finalized-pending");
    await user.tab();
    expect(screen.getByRole("button", { name: "Crear documento" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onCreate).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: /^Abrir pendiente: Entrega de soja/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /^Abrir Entrega de soja/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("doc-finalizado-pendiente-001");
  });

  it("varios documentos: cada botón abre su propio id", async () => {
    const documents = [...readyDocuments("commercial"), ...readyDocuments("finalized-registered")];
    const { user, onOpen } = renderState({ status: "ready", documents });
    expect(cards()).toHaveLength(2);
    expect(screen.getByText(/2 documentos$/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Abrir Acuerdo de flete/ }));
    expect(onOpen).toHaveBeenCalledWith("doc-finalizado-registrado-001");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renderiza título y advertencias como texto, nunca como HTML", () => {
    const [base] = readyDocuments("commercial");
    const markup = '<img src="x" onerror="alert(1)">Entrega';
    const document = {
      ...base,
      title: markup,
      warnings: [{ ...base.warnings[0], message: "<b>12</b> toneladas", sources: [] }],
    };
    const { container } = render(<DashboardReference state={{ status: "ready", documents: [document] }} onCreate={() => {}} onOpen={() => {}} onRetry={() => {}} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Documentos" })).getByRole("heading", { level: 3 })).toHaveTextContent(markup);
    expect(screen.getByText(/<b>12<\/b> toneladas/)).toBeInTheDocument();
    expect(screen.getByText("Fuentes: no informadas")).toBeInTheDocument();
  });

  it("cada escenario compartido renderiza sin afirmar verdad, certificación ni identidad verificada", () => {
    expect(dashboardScenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "commercial",
      "measurement",
      "confirmations",
      "finalized-pending",
      "finalized-registered",
    ]);
    for (const scenario of dashboardScenarios) {
      const { container, unmount } = render(
        <DashboardReference state={scenario.state} onCreate={() => {}} onOpen={() => {}} onRetry={() => {}} />,
      );
      expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
      expect(container.textContent, scenario.id).not.toMatch(forbiddenClaims);
      unmount();
    }
  });
});
