import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AuthFormState } from "@/lib/contracts/auth-forms";
import { authFormScenarios } from "@/mocks/auth";

import { RecoveryRequestForm } from "./recovery-request-form";

const scenarios = authFormScenarios.filter((s) => s.form === "recovery_request");

function scenarioState(id: string): AuthFormState {
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.state;
}

/** Campo por su etiqueta visible (el título de «Nueva contraseña» también nombra al formulario). */
const field = (label: string) => screen.getByLabelText(label, { selector: "input" });

function renderState(state: AuthFormState) {
  const onSubmit = vi.fn();
  const view = render(<RecoveryRequestForm state={state} onSubmit={onSubmit} />);
  return { ...view, onSubmit, user: userEvent.setup() };
}

function renderScenario(id: string) {
  return renderState(scenarioState(id));
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Correo electrónico"), "ana@ejemplo.test");
}

describe("RecoveryRequestForm (MVP-115)", () => {
  it("renderiza todos los escenarios de su formulario", () => {
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      const { unmount } = renderState(scenario.state);
      expect(screen.getByRole("heading", { level: 2, name: "Recuperar acceso" })).toBeInTheDocument();
      unmount();
    }
  });

  it("en reposo: etiquetas visibles, autocompletado y contraseña oculta por defecto", () => {
    renderScenario("recovery-idle");
    expect(screen.getByRole("form", { name: "Recuperar acceso" })).toBeInTheDocument();
    expect(field("Correo electrónico")).toHaveAttribute("autocomplete", "email");
    expect(field("Correo electrónico")).toHaveAttribute("type", "email");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solicitar recuperación" })).toBeEnabled();
  });

  it("Enter envía una vez con los valores escritos", async () => {
    const { user, onSubmit } = renderScenario("recovery-idle");
    await fill(user);
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: "ana@ejemplo.test" });
  });

  it("doble clic llama a onSubmit una sola vez; un nuevo estado habilita otro envío", async () => {
    const { user, onSubmit, rerender } = renderScenario("recovery-idle");
    await fill(user);
    await user.dblClick(screen.getByRole("button", { name: "Solicitar recuperación" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<RecoveryRequestForm state={scenarioState("recovery-field-errors")} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Solicitar recuperación" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("enviando: botón deshabilitado, estado anunciado y sin nuevos envíos", async () => {
    const { user, onSubmit } = renderScenario("recovery-submitting");
    const button = screen.getByRole("button", { name: "Enviando…" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Enviando…");
    expect(screen.getByRole("form", { name: "Recuperar acceso" })).toHaveAttribute("aria-busy", "true");
    await user.type(field("Correo electrónico"), "{Enter}");
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("errores por campo vinculados con aria-invalid y aria-describedby", () => {
    const state = scenarioState("recovery-field-errors");
    if (state.status !== "error") throw new Error("escenario sin error");
    renderState(state);
    const labels: Record<string, string> = { email: "Correo electrónico" };
    for (const { field: name, message } of state.fieldErrors) {
      const input = field(labels[name]);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription(message);
    }
    for (const [name, label] of Object.entries(labels)) {
      if (state.fieldErrors.some((e) => e.field === name)) continue;
      expect(field(label)).not.toHaveAttribute("aria-invalid");
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el resultado informado reemplaza el botón por el mensaje del contrato", async () => {
    const state = scenarioState("recovery-success");
    if (state.status !== "success") throw new Error("escenario sin éxito");
    const { user, onSubmit } = renderState(state);
    expect(screen.getByRole("status").textContent).toBe(state.message);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.type(field("Correo electrónico"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sin expresiones prohibidas por el PRD", () => {
    for (const scenario of scenarios) {
      const { unmount, container } = renderState(scenario.state);
      expect(container.textContent).not.toMatch(/certificad|validado regulatoriamente|garantizado verdadero|firma digital|identidad verificada/i);
      unmount();
    }
  });
});
