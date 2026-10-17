import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ChatViewState } from "@/features/chat/contracts/chat-view";
import { chatScenarios } from "@/features/chat/fixtures/chat-scenarios";

import { ChatReference } from "./chat-reference";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

function scenarioState(id: string): ChatViewState {
  const scenario = chatScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.state;
}

function renderState(state: ChatViewState, maxMessageChars = 8000) {
  const handlers = {
    onSend: vi.fn(),
    onCancel: vi.fn(),
    onRetryTurn: vi.fn(),
    onAttach: vi.fn(),
    onRetryAttachment: vi.fn(),
  };
  const view = render(<ChatReference state={state} maxMessageChars={maxMessageChars} {...handlers} />);
  const rerenderState = (next: ChatViewState) =>
    view.rerender(<ChatReference state={next} maxMessageChars={maxMessageChars} {...handlers} />);
  return { ...handlers, rerenderState, user: userEvent.setup() };
}

const forbiddenClaims = /certificad|validado|garantizad|firma digital|identidad verificada|verificado visualmente/i;

describe("ChatReference", () => {
  it("vacío: invita a escribir y no muestra el registro de mensajes", () => {
    renderState(scenarioState("empty"));
    expect(screen.getByText(/Todavía no hay mensajes/)).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("historial: muestra el texto original de cada mensaje en una región viva", () => {
    renderState(scenarioState("history"));
    const log = screen.getByRole("log", { name: "Mensajes" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveTextContent("Entregué 40 bolsas de semilla a Pérez el lunes.");
    expect(log).toHaveTextContent("¿Quién la recibió y en qué lugar?");
    expect(screen.getByRole("status")).toHaveTextContent("Contraste disponible");
  });

  it("streaming: muestra el texto parcial, deshabilita enviar y cancela por callback con foco en el composer", async () => {
    const { user, onCancel, onSend } = renderState(scenarioState("streaming"));
    expect(screen.getByText("Estoy armando el borrador")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Mensaje"), "otro");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancelar respuesta" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Mensaje")).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("error de proveedor: alerta técnica con reintento y sin mensaje de éxito", async () => {
    const { user, onRetryTurn } = renderState(scenarioState("provider-error"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("El proveedor de IA no respondió");
    expect(alert).toHaveTextContent("PROVIDER_UNAVAILABLE");
    expect(alert).toHaveTextContent("corr-1");
    await user.click(screen.getByRole("button", { name: "Reintentar respuesta" }));
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["network", "Sin conexión con el servidor"],
    ["storage", "No se pudo guardar el archivo"],
    ["permissions", "No tenés permiso para esta acción"],
    ["provider", "El proveedor de IA no respondió"],
  ] as const)("error %s: título propio y distinto de los demás", (kind, title) => {
    const state: ChatViewState = {
      ...scenarioState("empty"),
      turnError: { kind, code: "ERR_X", retryable: false, correlationId: null },
    };
    renderState(state);
    expect(screen.getByRole("alert")).toHaveTextContent(title);
    expect(screen.queryByRole("button", { name: "Reintentar respuesta" })).not.toBeInTheDocument();
  });

  it("adjunto rechazado: muestra el motivo estable y no ofrece reintento si no es reintentable", () => {
    renderState(scenarioState("attachment-rejected"));
    const list = screen.getByRole("list", { name: "Adjuntos" });
    expect(list).toHaveTextContent("remito.exe");
    expect(list).toHaveTextContent("Rechazado");
    expect(list).toHaveTextContent("UNSUPPORTED_TYPE");
    expect(screen.queryByRole("button", { name: /Reintentar carga/ })).not.toBeInTheDocument();
  });

  it("carga en curso: expone el progreso accesible", () => {
    renderState(scenarioState("upload-in-progress"));
    expect(screen.getByLabelText("Progreso de carga de remito.pdf")).toHaveAttribute("value", "40");
    expect(screen.getByText("Cargando")).toBeInTheDocument();
  });

  it("adjunto fallido reintentable: el reintento invoca el callback con su id", async () => {
    const state: ChatViewState = {
      ...scenarioState("empty"),
      attachments: [
        { attachmentId: "a9", fileName: "foto.png", byteLength: 10, status: "failed", progress: null, reasonCode: "STORAGE_UNAVAILABLE", retryable: true },
      ],
    };
    const { user, onRetryAttachment } = renderState(state);
    await user.click(screen.getByRole("button", { name: "Reintentar carga de foto.png" }));
    expect(onRetryAttachment).toHaveBeenCalledWith("a9");
  });

  it("estados parciales de adjunto y contraste se nombran sin afirmar éxito", () => {
    const state: ChatViewState = {
      ...scenarioState("empty"),
      contrast: "unavailable",
      attachments: [
        { attachmentId: "a3", fileName: "acta.pdf", byteLength: 2_000_000, status: "uploaded_without_extraction", progress: null, reasonCode: null, retryable: false },
      ],
    };
    renderState(state);
    expect(screen.getByText("Cargado sin extracción")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Contraste no disponible");
    expect(screen.getByText("1.9 MB")).toBeInTheDocument();
  });

  it("envía el texto original sin recortar, lo conserva hasta la confirmación y devuelve el foco", async () => {
    const empty = scenarioState("empty");
    const { user, onSend, rerenderState } = renderState(empty);
    const composer = screen.getByLabelText("Mensaje");
    await user.type(composer, "  hola  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).toHaveBeenCalledWith("  hola  ");
    expect(composer).toHaveValue("  hola  ");
    expect(composer).toHaveFocus();
    // Sin confirmación no se duplica el envío.
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    rerenderState({
      ...empty,
      messages: [{ messageId: "m-new", sender: "autor", content: "  hola  ", sentAt: "2026-10-16T12:00:00.000Z" }],
    });
    expect(screen.getByLabelText("Mensaje")).toHaveValue("");
  });

  it("si onSend falla, el texto se conserva y se puede reintentar", async () => {
    const { user, onSend } = renderState(scenarioState("empty"));
    onSend.mockImplementationOnce(() => {
      throw new Error("fallo técnico");
    });
    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(screen.getByLabelText("Mensaje")).toHaveValue("hola");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenLastCalledWith("hola");
  });

  it("no envía vacío ni por encima del límite", async () => {
    const { user, onSend } = renderState(scenarioState("empty"), 5);
    const send = screen.getByRole("button", { name: "Enviar" });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Mensaje"), "123456");
    expect(send).toBeDisabled();
    expect(screen.getByLabelText("Mensaje")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/supera el límite/)).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("adjuntar entrega los archivos elegidos al callback", async () => {
    const { user, onAttach } = renderState(scenarioState("empty"));
    const file = new File(["x"], "nota.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("chat-file-input"), file);
    expect(onAttach).toHaveBeenCalledWith([file]);
  });

  it("ningún escenario usa lenguaje vedado por el PRD", () => {
    for (const scenario of chatScenarios) {
      const { container, unmount } = render(
        <ChatReference
          state={scenario.state}
          maxMessageChars={8000}
          onSend={vi.fn()}
          onCancel={vi.fn()}
          onRetryTurn={vi.fn()}
          onAttach={vi.fn()}
          onRetryAttachment={vi.fn()}
        />,
      );
      expect(container.textContent ?? "").not.toMatch(forbiddenClaims);
      unmount();
    }
  });
});
