import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { authFormScenarios } from "@/mocks/auth";
import { snapshotScenarios, versionHistoryScenarios } from "@/mocks/documents";

import { PreviewApp } from "./preview-app";
import { previewEntries, type LocalHandlers } from "./registry";

const handlers: LocalHandlers = { onCreate: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn(), log: vi.fn() };

describe("registro del preview", () => {
  it("ids de entradas y de escenarios únicos", () => {
    const ids = previewEntries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of previewEntries) {
      const sc = entry.scenarios.map((s) => s.id);
      expect(new Set(sc).size, entry.id).toBe(sc.length);
    }
  });

  it("todo escenario de toda entrada renderiza sin error", () => {
    for (const entry of previewEntries) {
      for (const scenario of entry.scenarios) {
        const { unmount } = render(<div>{entry.render(scenario.id, handlers)}</div>);
        unmount();
      }
    }
  });

  it("las entradas placeholder lo declaran y vuelcan el contrato como JSON", () => {
    for (const entry of previewEntries.filter((e) => e.id.endsWith("-placeholder"))) {
      const { unmount } = render(<div>{entry.render(entry.scenarios[0].id, handlers)}</div>);
      expect(screen.getByRole("status")).toHaveTextContent("Placeholder de escenario");
      expect(JSON.parse(screen.getByTestId("scenario-json").textContent ?? "")).toBeTypeOf("object");
      unmount();
    }
  });
});

describe("entrada dashboard (MVP-111)", () => {
  it("monta la presentación real con los ocho escenarios, no el placeholder", () => {
    const entry = previewEntries.find((e) => e.id === "dashboard-reference");
    expect(entry?.scenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "commercial",
      "measurement",
      "confirmations",
      "finalized-pending",
      "finalized-registered",
    ]);
    const { unmount } = render(<div>{entry?.render("commercial", handlers)}</div>);
    expect(screen.queryByTestId("scenario-json")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Abrir Entrega de maíz/ })).toBeInTheDocument();
    unmount();
  });
});

describe("entrada snapshot (MVP-112)", () => {
  it("monta la presentación real con los siete escenarios, no el placeholder", () => {
    const entry = previewEntries.find((e) => e.id === "snapshot");
    expect(entry?.scenarios.map((s) => s.id)).toEqual(snapshotScenarios.map((s) => s.id));
    expect(entry?.scenarios).toHaveLength(7);
    for (const scenario of snapshotScenarios) {
      const { unmount } = render(<div>{entry?.render(scenario.id, handlers)}</div>);
      expect(screen.queryByTestId("scenario-json")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Snapshot congelado" })).toBeInTheDocument();
      unmount();
    }
  });

  it("«Reintentar» invoca solo el callback local onRetry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const entry = previewEntries.find((e) => e.id === "snapshot");
    render(<div>{entry?.render("error", { ...handlers, onRetry })}</div>);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("entrada auth-forms (MVP-115)", () => {
  const titles = { login: "Iniciar sesión", register: "Crear cuenta", recovery_request: "Recuperar acceso", new_password: "Nueva contraseña" };

  it("monta el formulario real que indica `form` en los 18 escenarios, no el placeholder", () => {
    const entry = previewEntries.find((e) => e.id === "auth-forms");
    expect(entry?.scenarios.map((s) => s.id)).toEqual(authFormScenarios.map((s) => s.id));
    expect(entry?.scenarios).toHaveLength(18);
    for (const scenario of authFormScenarios) {
      const { unmount } = render(<div>{entry?.render(scenario.id, handlers)}</div>);
      expect(screen.queryByTestId("scenario-json")).not.toBeInTheDocument();
      expect(screen.getByRole("form", { name: titles[scenario.form] })).toBeInTheDocument();
      unmount();
    }
  });

  it("el envío registra solo el nombre del evento, nunca los valores", async () => {
    const user = userEvent.setup();
    const log = vi.fn();
    const entry = previewEntries.find((e) => e.id === "auth-forms");
    render(<div>{entry?.render("login-idle", { ...handlers, log })}</div>);
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.test");
    await user.type(screen.getByLabelText("Contraseña"), "Clave-Ficticia-1");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(log.mock.calls).toEqual([["onSubmit(login)"]]);
  });
});

describe("entrada version-history (MVP-113)", () => {
  it("monta la presentación real con los seis escenarios, no el placeholder", () => {
    const entry = previewEntries.find((e) => e.id === "version-history");
    expect(entry?.scenarios.map((s) => s.id)).toEqual(versionHistoryScenarios.map((s) => s.id));
    expect(entry?.scenarios).toHaveLength(6);
    for (const scenario of versionHistoryScenarios) {
      const { unmount } = render(<div>{entry?.render(scenario.id, handlers)}</div>);
      expect(screen.queryByTestId("scenario-json")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Historial de versiones" })).toBeInTheDocument();
      unmount();
    }
  });

  it("seleccionar registra solo el evento con el ID y marca la versión; reintentar usa onRetry", async () => {
    const user = userEvent.setup();
    const log = vi.fn();
    const onRetry = vi.fn();
    const entry = previewEntries.find((e) => e.id === "version-history");
    const { unmount } = render(<div>{entry?.render("v1-registered-v2-pending", { ...handlers, log, onRetry })}</div>);
    const v1 = screen.getByRole("button", { name: "Versión 1" });
    expect(v1).not.toHaveAttribute("aria-current");
    await user.click(v1);
    expect(log.mock.calls).toEqual([['onSelect("ver-soja-001-1")']]);
    expect(v1).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Versión 2" })).not.toHaveAttribute("aria-current");
    unmount();

    render(<div>{entry?.render("error", { ...handlers, log, onRetry })}</div>);
    await user.click(screen.getByRole("button", { name: "Reintentar carga" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("PreviewApp con varias entradas", () => {
  it("ofrece selector de componente y cambia de escenarios al elegir una entrada", async () => {
    const user = userEvent.setup();
    render(<PreviewApp />);
    const components = screen.getByRole("group", { name: "Componente" });
    await user.click(within(components).getByRole("button", { name: /Historial/ }));
    const scenarios = screen.getByRole("group", { name: "Escenario" });
    expect(within(scenarios).getByRole("button", { name: "Cargando" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(scenarios).getByRole("button", { name: "v1 registrada y v2 con sello pendiente" }));
    await user.click(within(screen.getByTestId("preview-stage")).getByRole("button", { name: "Versión 1" }));
    expect(within(screen.getByRole("complementary")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(['onSelect("ver-soja-001-1")']);
  });
});
