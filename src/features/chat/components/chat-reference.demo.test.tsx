import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { chatScenarios } from "@/features/chat/fixtures/chat-scenarios";

import { ChatReference } from "./chat-reference";

// Interruptor de la demo encendido (valor real): el chat no muestra advertencias, avisos ni estado del contraste.
describe("ChatReference · advertencias ocultas (demo)", () => {
  it("ningún escenario muestra advertencias, avisos de contraste ni «Contraste …»", () => {
    for (const scenario of chatScenarios) {
      const state = {
        ...scenario.state,
        contrast: "unavailable" as const,
        contrastFindings: [{ message: "Fecha dudosa", severity: "warning" as const }],
        draft: { draftId: "d1", draftRevision: 2, title: "T", warnings: 3, notInformed: 2 },
      };
      const { container, unmount } = render(
        <ChatReference state={state} maxMessageChars={8000} onSend={vi.fn()} onCancel={vi.fn()} onRetryTurn={vi.fn()} onAttach={vi.fn()} onRetryAttachment={vi.fn()} />,
      );
      expect(container.textContent, scenario.id).not.toMatch(/advertencia|contraste|no informados|Fecha dudosa/i);
      unmount();
    }
  });
});
