import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { authFormScenarios } from "@/mocks/auth";
import { landingScenarios } from "@/mocks/marketing";

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

describe("entrada landing (MVP-114)", () => {
  it("monta la landing real en sus dos escenarios, no el placeholder", () => {
    const entry = previewEntries.find((e) => e.id === "landing");
    expect(entry?.scenarios.map((s) => s.id)).toEqual(landingScenarios.map((s) => s.id));
    expect(entry?.scenarios.map((s) => s.id)).toEqual(["public", "signed-in"]);
    for (const scenario of landingScenarios) {
      const { unmount } = render(<div>{entry?.render(scenario.id, handlers)}</div>);
      expect(screen.queryByTestId("scenario-json")).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: scenario.content.heading })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: scenario.content.primaryAction.label })).toHaveAttribute("href", scenario.content.primaryAction.href);
      unmount();
    }
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
    await user.click(screen.getByRole("button", { name: 'onSelect("ver-soja-001-2")' }));
    expect(within(screen.getByRole("complementary")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(['onSelect("ver-soja-001-2")']);
  });
});
