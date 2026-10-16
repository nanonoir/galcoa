import { describe, expect, it } from "vitest";

import { ChatAttachmentViewSchema, ChatErrorViewSchema, ChatViewStateSchema } from "@/features/chat/contracts/chat-view";
import { chatScenarios } from "@/features/chat/fixtures/chat-scenarios";

describe("ChatViewStateSchema", () => {
  it.each(chatScenarios.map((s) => [s.id, s.state] as const))("el escenario %s cumple el contrato", (_id, state) => {
    expect(ChatViewStateSchema.parse(state)).toEqual(state);
  });

  it("rechaza campos extra y remitentes desconocidos", () => {
    const base = chatScenarios[1]!.state;
    expect(ChatViewStateSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(
      ChatViewStateSchema.safeParse({
        ...base,
        messages: [{ ...base.messages[0], sender: "sistema" }],
      }).success,
    ).toBe(false);
  });

  it("rechaza mensajes vacíos y fechas no ISO", () => {
    const m = chatScenarios[1]!.state.messages[0]!;
    expect(ChatViewStateSchema.safeParse({ ...chatScenarios[0]!.state, messages: [{ ...m, content: "" }] }).success).toBe(false);
    expect(ChatViewStateSchema.safeParse({ ...chatScenarios[0]!.state, messages: [{ ...m, sentAt: "ayer" }] }).success).toBe(false);
  });
});

describe("ChatAttachmentViewSchema y ChatErrorViewSchema", () => {
  const attachment = { attachmentId: "a", fileName: "f.pdf", byteLength: 1, status: "uploading", progress: 10, reasonCode: null, retryable: false };

  it("acepta un adjunto válido y rechaza estado, progreso o motivo inválidos", () => {
    expect(ChatAttachmentViewSchema.safeParse(attachment).success).toBe(true);
    expect(ChatAttachmentViewSchema.safeParse({ ...attachment, status: "aprobado" }).success).toBe(false);
    expect(ChatAttachmentViewSchema.safeParse({ ...attachment, progress: 120 }).success).toBe(false);
    expect(ChatAttachmentViewSchema.safeParse({ ...attachment, reasonCode: "motivo libre" }).success).toBe(false);
  });

  it("el error técnico exige código estable y tipo conocido", () => {
    const error = { kind: "network", code: "NETWORK_ERROR", retryable: true, correlationId: null };
    expect(ChatErrorViewSchema.safeParse(error).success).toBe(true);
    expect(ChatErrorViewSchema.safeParse({ ...error, kind: "warning" }).success).toBe(false);
    expect(ChatErrorViewSchema.safeParse({ ...error, code: "con espacios" }).success).toBe(false);
  });
});
