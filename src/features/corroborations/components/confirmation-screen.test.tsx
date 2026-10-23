import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ConfirmationViewState } from "@/features/corroborations/contracts/confirmation-screen";
import type { ConfirmationResult } from "@/lib/contracts/confirmation";
import type { PublicInvitation } from "@/lib/contracts/public";

import { ConfirmationScreen } from "./confirmation-screen";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

// Datos ficticios.
const invitation: PublicInvitation = {
  schemaVersion: 1,
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  role: "comprador",
  selection: ["autor", "comprador"],
  operation: { title: "Acuerdo ficticio de entrega", body: "Se entregan 12 cajas de ejemplo.\nPrecio no informado.", corrections: ["Ortografía: «entregan»"] },
  warnings: [
    {
      id: "aviso-1",
      message: "Las fuentes no coinciden: 10 cajas (Fuente A) y 12 cajas (Fuente B).",
      severity: "critical",
      sources: [
        { alias: "Fuente A", description: "mensaje del chat" },
        { alias: "Fuente B", description: "evidencia aportada" },
      ],
    },
  ],
  availability: "disponible",
  expiresAt: "2026-10-19T12:00:00.000Z",
};

const result = (decision: "confirmar" | "rechazar"): ConfirmationResult => ({
  schemaVersion: 1,
  responseId: "resp-1",
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  respondedAt: "2026-10-16T12:00:00.000Z",
  replayed: false,
  confirmationStatus: decision === "confirmar" ? "parcial" : "rechazada",
  actor: { role: "comprador", declaredName: "Juan Pérez" },
  outcome: decision === "confirmar" ? { decision: "confirmar", checkboxChecked: true } : { decision: "rechazar", checkboxChecked: false, rejectionRatified: true },
});

const forbidden = /certificad|firma digital|identidad verificada|garantizad|validado regulatoriamente|verdader/i;

function setup(state: ConfirmationViewState = { status: "ready", invitation }) {
  const handlers = { onConfirm: vi.fn(), onReject: vi.fn(), onRetry: vi.fn() };
  const view = render(<ConfirmationScreen state={state} {...handlers} />);
  return { ...view, ...handlers, user: userEvent.setup() };
}

const nameInput = () => screen.getByLabelText("Nombre completo");
const checkbox = () => screen.getByRole("checkbox");
const confirmButton = () => screen.getByRole("button", { name: "Confirmar" });
const rejectButton = () => screen.getByRole("button", { name: "No coincide / Rechazar" });

describe("ConfirmationScreen · operación visible", () => {
  it("muestra la operación completa, las correcciones y las advertencias con sus fuentes por alias", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Acuerdo ficticio de entrega" })).toBeInTheDocument();
    expect(screen.getByText(/Se entregan 12 cajas de ejemplo/)).toBeInTheDocument();
    expect(screen.getByText("Ortografía: «entregan»")).toBeInTheDocument();
    const warnings = screen.getByRole("region", { name: "Advertencias" });
    expect(within(warnings).getByText(/Las fuentes no coinciden/)).toBeInTheDocument();
    expect(within(warnings).getByText("Fuente A:")).toBeInTheDocument();
    expect(within(warnings).getByText("evidencia aportada")).toBeInTheDocument();
    expect(screen.getByText(/Vas a responder como:/).closest("p")).toHaveTextContent("Comprador");
  });

  it("no usa lenguaje de certificación ni de identidad comprobada", () => {
    const { container } = setup();
    expect(container.textContent).not.toMatch(forbidden);
  });

  it("no expone ids internos ni el hash del snapshot", () => {
    const { container } = setup();
    expect(container.textContent).not.toMatch(/rev-1|snap-1|a{20}/);
  });
});

describe("ConfirmationScreen · casilla, nombre y botones", () => {
  it("la casilla nace vacía y los dos botones están deshabilitados hasta completar", () => {
    setup();
    expect(checkbox()).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
    expect(rejectButton()).toBeDisabled();
  });

  it("‘Confirmar’ exige casilla marcada y nombre válido; una advertencia crítica no bloquea", async () => {
    const { user } = setup();
    await user.click(checkbox());
    expect(confirmButton()).toBeDisabled();
    await user.type(nameInput(), "   ");
    expect(confirmButton()).toBeDisabled();
    await user.clear(nameInput());
    await user.type(nameInput(), "Juan Pérez");
    expect(confirmButton()).toBeEnabled();
    await user.clear(nameInput());
    await user.type(nameInput(), "a".repeat(201));
    expect(confirmButton()).toBeDisabled();
  });

  it("‘No coincide / Rechazar’ está visible con la casilla vacía y nombre, y se deshabilita si se marca la casilla", async () => {
    const { user } = setup();
    expect(rejectButton()).toBeVisible();
    await user.type(nameInput(), "Juan Pérez");
    expect(rejectButton()).toBeEnabled();
    await user.click(checkbox());
    expect(rejectButton()).toBeDisabled();
    expect(screen.getByText("Para rechazar, desmarcá la casilla.")).toBeInTheDocument();
    await user.click(checkbox());
    expect(rejectButton()).toBeEnabled();
  });

  it("confirmar entrega el nombre sin espacios sobrantes y una sola vez, aun con doble clic", async () => {
    const { user, onConfirm } = setup();
    await user.type(nameInput(), "  Juan Pérez  ");
    await user.click(checkbox());
    await user.dblClick(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ declaredName: "Juan Pérez" });
  });

  it("se completa con teclado: Tab, Espacio y Enter", async () => {
    const { user, onConfirm } = setup();
    await user.click(nameInput());
    await user.keyboard("Ana Gómez");
    await user.tab();
    expect(checkbox()).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox()).toBeChecked();
    await user.tab();
    expect(confirmButton()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({ declaredName: "Ana Gómez" });
  });

  it("los campos tienen nombre accesible", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Nombre completo" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Leí la operación y coincide con lo que conozco/ })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Tu respuesta" })).toBeInTheDocument();
  });
});

describe("ConfirmationScreen · modal de rechazo", () => {
  async function openModal() {
    const ctx = setup();
    await ctx.user.type(nameInput(), "Juan Pérez");
    await ctx.user.click(rejectButton());
    const dialog = await screen.findByRole("alertdialog");
    return { ...ctx, dialog };
  }

  it("abre un modal que pide ratificar y no envía nada todavía", async () => {
    const { dialog, onReject } = await openModal();
    expect(within(dialog).getByText("¿Rechazar esta operación?")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Juan Pérez");
    expect(onReject).not.toHaveBeenCalled();
  });

  it("cancelar no envía ni consume nada", async () => {
    const { user, dialog, onReject, onConfirm } = await openModal();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onReject).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(rejectButton()).toBeEnabled();
  });

  it("Escape cierra el modal sin enviar", async () => {
    const { user, onReject } = await openModal();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onReject).not.toHaveBeenCalled();
  });

  it("ratificar envía el rechazo una sola vez con nombre y ratificación", async () => {
    const { user, dialog, onReject } = await openModal();
    await user.click(within(dialog).getByRole("button", { name: "Sí, rechazar" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith({ declaredName: "Juan Pérez", ratified: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("ConfirmationScreen · mensajes de la invitación", () => {
  function invitationWithRole(role: PublicInvitation["role"]): PublicInvitation {
    return {
      ...invitation,
      role,
      selection: role === "intermediario" ? ["autor", "intermediario", "comprador"] : ["autor", "comprador"],
    };
  }

  it.each([
    ["comprador", "comprador"],
    ["intermediario", "transportista"],
  ] as const)("en ready explica que el proveedor pide confirmar como %s", (role, label) => {
    setup({ status: "ready", invitation: invitationWithRole(role) });
    expect(screen.getByRole("heading", { name: "Revisión de una operación" })).toBeInTheDocument();
    const intro = screen.getByText(/El proveedor te pide que confirmes esta entrega como/);
    expect(within(intro).getByText(label).tagName).toBe("STRONG");
    expect(intro).toHaveTextContent(
      `El proveedor te pide que confirmes esta entrega como ${label}. No hace falta cuenta. Solo podés confirmar o decir que no coincide; no podés editarla.`,
    );
  });

  it.each([
    ["submitting", { status: "submitting", invitation }],
    ["submit_error", { status: "submit_error", invitation, message: "No pudimos enviar tu respuesta." }],
  ] as const)("en %s conserva el mensaje del proveedor", (_status, state) => {
    setup(state);
    expect(screen.getByText(/El proveedor te pide que confirmes esta entrega como/)).toHaveTextContent("No hace falta cuenta.");
  });

  it("al confirmar avisa que el proveedor genera el PDF final y registra la huella", () => {
    setup({ status: "done", result: result("confirmar") });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Registramos tu confirmación");
    expect(status).toHaveTextContent("Cuando estén todas, el proveedor genera el PDF final y registra una huella que permite comprobar que no cambió.");
    expect(status).toHaveTextContent("El nombre es el que declaraste; no se verificó contra ningún documento.");
  });

  it("al rechazar avisa que el proveedor tiene que corregir y pedir una nueva confirmación", () => {
    setup({ status: "done", result: result("rechazar") });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Registramos que no coincide");
    expect(status).toHaveTextContent("El proveedor tiene que corregir y pedirte una nueva confirmación.");
  });
});

describe("ConfirmationScreen · estados", () => {
  it("enviando: bloquea el formulario y no muestra éxito", () => {
    setup({ status: "submitting", invitation });
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(nameInput()).toHaveAttribute("readonly");
    expect(screen.queryByText(/Registramos/)).not.toBeInTheDocument();
  });

  it("error de envío: mensaje y reintento sin perder la pantalla", async () => {
    const { user, onRetry } = setup({ status: "submit_error", invitation, message: "No pudimos enviar tu respuesta." });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos enviar tu respuesta.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Acuerdo ficticio de entrega")).toBeInTheDocument();
  });

  it("error técnico de carga: reintento", async () => {
    const { user, onRetry } = setup({ status: "technical_error", message: "No pudimos cargar la operación." });
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it.each([
    ["ya_respondida", "Este enlace ya fue usado"],
    ["caducada", "Este enlace venció"],
    ["sustituida", "Esta revisión fue reemplazada"],
    ["no_disponible", "Enlace no disponible"],
  ] as const)("enlace %s: mensaje claro y sin formulario", (reason, title) => {
    const { container } = setup({ status: "unavailable", reason });
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(forbidden);
  });

  it("confirmación persistida: ‘Confirmado mediante enlace’, con el nombre declarado y sin afirmar identidad", () => {
    const { container } = setup({ status: "done", result: result("confirmar") });
    expect(screen.getByRole("status")).toHaveTextContent("Registramos tu confirmación");
    expect(screen.getByRole("status")).toHaveTextContent("Confirmado mediante enlace");
    expect(screen.getByRole("status")).toHaveTextContent("Juan Pérez");
    expect(container.textContent).not.toMatch(forbidden);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("rechazo persistido: lo dice sin ambigüedad", () => {
    setup({ status: "done", result: result("rechazar") });
    expect(screen.getByRole("status")).toHaveTextContent("Registramos que no coincide");
    expect(screen.getByRole("status")).toHaveTextContent("Rechazado mediante enlace");
  });
});
