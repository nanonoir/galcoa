import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AuthFormState } from "@/lib/contracts/auth-forms";
import { authFormScenarios } from "@/mocks/auth";

import { RegisterForm } from "./register-form";

const scenarios = authFormScenarios.filter((s) => s.form === "register");

function scenarioState(id: string): AuthFormState {
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.state;
}

/** Campo por su etiqueta visible (el título de «Nueva contraseña» también nombra al formulario). */
const field = (label: string) => screen.getByLabelText(label, { selector: "input" });

function renderState(state: AuthFormState) {
  const onSubmit = vi.fn();
  const view = render(<RegisterForm state={state} onSubmit={onSubmit} />);
  return { ...view, onSubmit, user: userEvent.setup() };
}

function renderScenario(id: string) {
  return renderState(scenarioState(id));
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Correo electrónico"), "ana@ejemplo.test");
  await user.type(field("Contraseña"), "Clave-Ficticia-1");
  await user.type(field("Confirmar contraseña"), "Clave-Ficticia-2");
}

describe("RegisterForm (MVP-115)", () => {
  it("renderiza todos los escenarios de su formulario", () => {
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      const { unmount } = renderState(scenario.state);
      expect(screen.getByRole("heading", { level: 2, name: "Crear cuenta" })).toBeInTheDocument();
      unmount();
    }
  });

  it("en reposo: etiquetas visibles, autocompletado y contraseña oculta por defecto", () => {
    renderScenario("register-idle");
    expect(screen.getByRole("form", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(field("Correo electrónico")).toHaveAttribute("autocomplete", "email");
    expect(field("Contraseña")).toHaveAttribute("autocomplete", "new-password");
    expect(field("Confirmar contraseña")).toHaveAttribute("autocomplete", "new-password");
    expect(field("Correo electrónico")).toHaveAttribute("type", "email");
    expect(field("Contraseña")).toHaveAttribute("type", "password");
    expect(field("Confirmar contraseña")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  it("Enter envía una vez con los valores escritos", async () => {
    const { user, onSubmit } = renderScenario("register-idle");
    await fill(user);
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: "ana@ejemplo.test", password: "Clave-Ficticia-1", confirmPassword: "Clave-Ficticia-2" });
  });

  it("doble clic llama a onSubmit una sola vez; un nuevo estado habilita otro envío", async () => {
    const { user, onSubmit, rerender } = renderScenario("register-idle");
    await fill(user);
    await user.dblClick(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<RegisterForm state={scenarioState("register-field-errors")} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("enviando: botón deshabilitado, estado anunciado y sin nuevos envíos", async () => {
    const { user, onSubmit } = renderScenario("register-submitting");
    const button = screen.getByRole("button", { name: "Enviando…" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Enviando…");
    expect(screen.getByRole("form", { name: "Crear cuenta" })).toHaveAttribute("aria-busy", "true");
    await user.type(field("Correo electrónico"), "{Enter}");
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("errores por campo vinculados con aria-invalid y aria-describedby", () => {
    const state = scenarioState("register-field-errors");
    if (state.status !== "error") throw new Error("escenario sin error");
    renderState(state);
    const labels: Record<string, string> = { email: "Correo electrónico", password: "Contraseña", confirmPassword: "Confirmar contraseña" };
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

  it("muestra el error global tal como llega, anunciado y sin inferir cuentas", () => {
    const state = scenarioState("register-error");
    if (state.status !== "error" || state.message === null) throw new Error("escenario sin mensaje global");
    const { container } = renderState(state);
    expect(screen.getByRole("alert").textContent).toBe(state.message);
    expect(container.textContent).not.toMatch(/ya existe|no existe|ya registrad|correo enviado|te enviamos/i);
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  it("el resultado informado reemplaza el botón por el mensaje del contrato", async () => {
    const state = scenarioState("register-success");
    if (state.status !== "success") throw new Error("escenario sin éxito");
    const { user, onSubmit } = renderState(state);
    expect(screen.getByRole("status").textContent).toBe(state.message);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.type(field("Correo electrónico"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("la contraseña no aparece en atributos, texto ni consola", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const { user, onSubmit, container } = renderScenario("register-idle");
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    for (const secret of ["Clave-Ficticia-1", "Clave-Ficticia-2"]) {
      expect(container.innerHTML).not.toContain(secret);
      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    }
    spies.forEach((s) => s.mockRestore());
  });

  it("sin expresiones prohibidas por el PRD", () => {
    for (const scenario of scenarios) {
      const { unmount, container } = renderState(scenario.state);
      expect(container.textContent).not.toMatch(/certificad|validado regulatoriamente|garantizado verdadero|firma digital|identidad verificada/i);
      unmount();
    }
  });
});
