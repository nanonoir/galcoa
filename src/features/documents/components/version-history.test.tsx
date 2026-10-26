import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { VersionHistoryViewState } from "@/lib/contracts/version-history-view";
import { versionHistoryScenarios } from "@/mocks/documents";

import { VersionHistory } from "./version-history";

function scenario(id: string) {
  const found = versionHistoryScenarios.find((s) => s.id === id);
  if (!found) throw new Error(`Escenario inexistente: ${id}`);
  return found;
}

function renderState(state: VersionHistoryViewState, selectedVersionId: string | null) {
  const handlers = { onSelect: vi.fn(), onRetry: vi.fn() };
  render(<VersionHistory state={state} selectedVersionId={selectedVersionId} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
}

function renderScenario(id: string) {
  const { state, selectedVersionId } = scenario(id);
  return renderState(state, selectedVersionId);
}

/** Versiones de un escenario `ready`, para derivar casos negativos sin fixtures nuevos. */
function readyVersions(id: string) {
  const { state } = scenario(id);
  if (state.status !== "ready") throw new Error(`El escenario ${id} no es ready`);
  return state.versions;
}

function items() {
  return within(screen.getByRole("list")).getAllByRole("button");
}

function item(number: number) {
  return screen.getByRole("button", { name: new RegExp(`^Versión ${number}\\b`) });
}

const forbiddenClaims = /certificad|validado regulatoriamente|garantizad|firma digital|identidad verificada|verdader|íntegr|sellada/i;
const forbiddenActions = /editar|regenerar|reintentar sello|descargar|pdf/i;

describe("VersionHistory", () => {
  it("cubre los seis escenarios del contrato", () => {
    expect(versionHistoryScenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "single-registered",
      "v1-registered-v2-pending",
      "seal-failed",
    ]);
  });

  it("carga: anuncia el estado y no muestra lista, vacío ni error", () => {
    renderScenario("loading");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando historial de versiones");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay versiones/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("error: muestra el mensaje como texto y reintenta la carga solo por su callback", async () => {
    const { user, onRetry, onSelect } = renderScenario("error");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar el historial de versiones");
    expect(alert).toHaveTextContent("No se pudo cargar el historial. Intenta nuevamente.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay versiones/)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Reintentar carga" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("error: el mensaje se muestra como texto, nunca como HTML", () => {
    renderState({ status: "error", message: "<b>falla</b>" }, null);
    expect(screen.getByRole("alert")).toHaveTextContent("<b>falla</b>");
    expect(screen.getByRole("alert").querySelector("b")).toBeNull();
  });

  it("vacío: es `ready` sin versiones y se distingue de carga y error, sin botones", () => {
    renderScenario("empty");
    expect(screen.getByText("Todavía no hay versiones finalizadas.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("una versión registrada: finalizada y sello registrado, seleccionada y anunciada", () => {
    renderScenario("single-registered");
    const v1 = item(1);
    expect(items()).toHaveLength(1);
    expect(v1).toHaveTextContent("Primera versión");
    expect(v1).toHaveTextContent("Versión finalizada");
    expect(v1).toHaveTextContent("Sello registrado");
    expect(v1).toHaveTextContent("14 mar 2026");
    expect(v1).toHaveAttribute("aria-current", "true");
    expect(v1).toHaveTextContent("Seleccionada");
  });

  it("v1 registrada y v2 pendiente: reciente primero, cada una conserva su propio sello", () => {
    renderScenario("v1-registered-v2-pending");
    expect(items().map((b) => b.textContent?.match(/^Versión \d+/)?.[0])).toEqual(["Versión 2", "Versión 1"]);
    const v1 = item(1);
    const v2 = item(2);
    expect(v2).toHaveTextContent("Sustituye a la versión 1");
    expect(v2).toHaveTextContent("Versión finalizada");
    expect(v2).toHaveTextContent("Sello pendiente");
    expect(v2).not.toHaveTextContent("Sello registrado");
    expect(v1).toHaveTextContent("Sello registrado");
    expect(v1).not.toHaveTextContent("Sello pendiente");
    expect(v2).toHaveAccessibleName("Versión 2");
    expect(v2).toHaveAccessibleDescription(/^Sustituye a la versión 1\. Finalización: versión finalizada el 15 mar 2026.+UTC\. Registro en Hedera: sello pendiente\.$/);
    expect(v1).toHaveAccessibleDescription(/Registro en Hedera: sello registrado\.$/);
    expect(v2).toHaveAttribute("aria-current", "true");
    expect(v1).not.toHaveAttribute("aria-current");
    expect(v1).not.toHaveTextContent("Seleccionada");
  });

  it("sello fallido: la versión sigue finalizada y el sello se lee como pendiente", () => {
    renderScenario("seal-failed");
    const v1 = item(1);
    expect(v1).toHaveTextContent("Versión finalizada");
    expect(v1).toHaveTextContent("Sello pendiente");
    expect(v1).toHaveTextContent("El último intento de registro no se completó.");
    expect(v1).not.toHaveTextContent(/Sello registrado|fallid|no finalizada/i);
    expect(v1).toHaveAccessibleDescription(/versión finalizada el .+ sello pendiente\. El último intento de registro no se completó\.$/);
    // selectedVersionId null: nada seleccionado.
    expect(v1).not.toHaveAttribute("aria-current");
  });

  it("sello no iniciado: también es sello pendiente con la versión finalizada", () => {
    const [base] = readyVersions("single-registered");
    renderState({ status: "ready", versions: [{ ...base, hcsStatus: "no_iniciado" }] }, null);
    expect(item(1)).toHaveTextContent("Sello pendiente");
    expect(item(1)).toHaveTextContent("Versión finalizada");
    expect(item(1)).not.toHaveTextContent("Sello registrado");
  });

  it("no muestra IDs técnicos como contenido", () => {
    for (const id of ["v1-registered-v2-pending", "single-registered", "seal-failed"]) {
      const { unmount } = render(
        <VersionHistory state={scenario(id).state} selectedVersionId={scenario(id).selectedVersionId} onSelect={vi.fn()} onRetry={vi.fn()} />,
      );
      for (const v of readyVersions(id)) {
        for (const technical of [v.versionId, v.revisionId, v.snapshotId]) {
          expect(document.body).not.toHaveTextContent(technical);
        }
      }
      unmount();
    }
  });

  it("antecedente ausente del historial: lo dice sin inventar un número", () => {
    const [, v2] = readyVersions("v1-registered-v2-pending");
    renderState({ status: "ready", versions: [v2] }, null);
    expect(item(2)).toHaveTextContent("Versión anterior no disponible en este historial");
  });

  it("seleccionar con clic llama solo onSelect con el ID de esa versión", async () => {
    const { user, onSelect, onRetry } = renderScenario("v1-registered-v2-pending");
    await user.click(item(1));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("ver-soja-001-1");
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("teclado: Tab recorre las versiones en orden y Enter/Espacio seleccionan", async () => {
    const { user, onSelect } = renderScenario("v1-registered-v2-pending");
    await user.tab();
    expect(item(2)).toHaveFocus();
    await user.tab();
    expect(item(1)).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.tab({ shift: true });
    expect(item(2)).toHaveFocus();
    await user.keyboard(" ");
    expect(onSelect.mock.calls).toEqual([["ver-soja-001-1"], ["ver-soja-001-2"]]);
  });

  it("la selección es controlada: cambia solo cuando cambia la prop", async () => {
    const state = scenario("v1-registered-v2-pending").state;
    const onSelect = vi.fn();
    const { rerender } = render(<VersionHistory state={state} selectedVersionId="ver-soja-001-2" onSelect={onSelect} onRetry={vi.fn()} />);
    await userEvent.setup().click(item(1));
    expect(item(1)).not.toHaveAttribute("aria-current");
    rerender(<VersionHistory state={state} selectedVersionId="ver-soja-001-1" onSelect={onSelect} onRetry={vi.fn()} />);
    expect(item(1)).toHaveAttribute("aria-current", "true");
    expect(item(2)).not.toHaveAttribute("aria-current");
  });

  it("un ID seleccionado que no está en la lista no marca ninguna versión", () => {
    renderState(scenario("v1-registered-v2-pending").state, "ver-inexistente");
    for (const button of items()) expect(button).not.toHaveAttribute("aria-current");
  });

  it("con pdfHref ofrece un enlace hermano de descarga por versión, fuera del botón de selección", () => {
    const { state } = scenario("v1-registered-v2-pending");
    render(
      <VersionHistory
        state={state}
        selectedVersionId={null}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        pdfHref={(n) => `/api/documents/doc-1/versions/${n}/pdf`}
      />,
    );
    const link = screen.getByRole("link", { name: "Descargar PDF de la versión 2" });
    expect(link).toHaveAttribute("href", "/api/documents/doc-1/versions/2/pdf");
    expect(screen.getByRole("link", { name: "Descargar PDF de la versión 1" })).toHaveAttribute("href", "/api/documents/doc-1/versions/1/pdf");
    expect(item(2)).not.toContainElement(link);
  });

  it("sin pdfHref no hay enlaces de descarga", () => {
    renderScenario("v1-registered-v2-pending");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("no ofrece editar, regenerar PDF ni reintentar sello, y no usa afirmaciones prohibidas", () => {
    for (const s of versionHistoryScenarios) {
      const { unmount } = render(<VersionHistory state={s.state} selectedVersionId={s.selectedVersionId} onSelect={vi.fn()} onRetry={vi.fn()} />);
      for (const button of screen.queryAllByRole("button")) {
        expect(button.textContent, s.id).not.toMatch(forbiddenActions);
      }
      expect(document.body.textContent, s.id).not.toMatch(forbiddenClaims);
      unmount();
    }
  });
});
