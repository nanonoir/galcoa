"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatReference } from "@/features/chat/components/chat-reference";
import type { ChatErrorView, ChatMessageView, ChatViewState } from "@/features/chat/contracts/chat-view";
import type { Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";

import { loadMessages, requestContrast, runTurn, type TurnCommand, type TurnStreamEvent } from "./chat-client";

/**
 * Container del chat (MVP-054): consume `POST /api/documents/[id]/chat` (NDJSON) y
 * `.../contrast`. El historial siempre sale del servidor; lo local es transitorio (mensaje en
 * envío, avance del turno). Cancelar aborta la petición; reintentar reutiliza el mismo
 * `clientMessageId` para no duplicar el mensaje. El contraste corre tras un borrador publicado
 * y su fallo no bloquea el chat. Nunca se muestra éxito sin confirmación del servidor.
 */

const LOGIN_PATH = "/acceso";
const MAX_MESSAGE_CHARS = 8000;

const toView = (m: Message): ChatMessageView => ({ messageId: m.messageId, sender: m.sender, content: m.content, sentAt: m.uploadedAt });

function toErrorView(error: TechnicalError, status: number): ChatErrorView {
  const kind =
    status === 0 ? "network" : status === 401 || status === 403 || error.stage === "autenticacion" ? "permissions" : error.stage === "ia" ? "provider" : "other";
  return { kind, code: error.code, retryable: error.retryable, correlationId: error.correlationId };
}

const EMPTY: ChatViewState = { messages: [], streaming: null, attachments: [], contrast: "idle", turnError: null, draft: null };

export function ChatContainer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ChatViewState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const lastCommand = useRef<TurnCommand | null>(null);
  const running = useRef(false);

  const patch = useCallback((next: Partial<ChatViewState>) => setState((current) => ({ ...current, ...next })), []);

  const sync = useCallback(async () => {
    const result = await loadMessages(documentId);
    if (result.ok) patch({ messages: result.value.map(toView) });
    else if (result.status === 401) router.replace(LOGIN_PATH);
    else patch({ turnError: toErrorView(result.error, result.status) });
  }, [documentId, patch, router]);

  useEffect(() => {
    const initial = new AbortController();
    void loadMessages(documentId, initial.signal).then((result) => {
      if (initial.signal.aborted) return;
      if (result.ok) setState((current) => ({ ...current, messages: result.value.map(toView) }));
      else if (result.status === 401) router.replace(LOGIN_PATH);
      else setState((current) => ({ ...current, turnError: toErrorView(result.error, result.status) }));
    });
    return () => {
      initial.abort();
      abortRef.current?.abort();
    };
  }, [documentId, router]);

  const contrast = useCallback(
    async (signal: AbortSignal) => {
      patch({ contrast: "running" });
      const result = await requestContrast(documentId, signal);
      if (signal.aborted) return;
      if (result.ok) patch({ contrast: "done", contrastFindings: result.value.findings });
      else patch({ contrast: "unavailable" });
    },
    [documentId, patch],
  );

  const execute = useCallback(
    async (command: TurnCommand) => {
      if (running.current) return;
      running.current = true;
      lastCommand.current = command;
      const controller = new AbortController();
      abortRef.current = controller;
      const outcome: { published: boolean; cancelled: boolean; failed: { error: TechnicalError; status: number } | null } = {
        published: false,
        cancelled: false,
        failed: null,
      };
      setState((current) => ({ ...current, streaming: { content: "" }, turnError: null, contrast: "idle", contrastFindings: undefined }));

      const onEvent = (event: TurnStreamEvent) => {
        if (event.type === "user_message") {
          setState((current) =>
            current.messages.some((m) => m.messageId === event.messageId)
              ? current
              : { ...current, messages: [...current.messages, { messageId: event.messageId, sender: "autor", content: command.content, sentAt: new Date().toISOString() }] },
          );
        } else if (event.type === "draft") {
          outcome.published = true;
          const { draftId, draftRevision, title, warnings, notInformed } = event;
          patch({ draft: { draftId, draftRevision, title, ...(warnings === undefined ? {} : { warnings }), ...(notInformed === undefined ? {} : { notInformed }) } });
        } else if (event.type === "agent_message") {
          setState((current) => ({
            ...current,
            messages: current.messages.some((m) => m.messageId === event.messageId)
              ? current.messages
              : [...current.messages, { messageId: event.messageId, sender: "agente", content: event.content, sentAt: new Date().toISOString() }],
          }));
        } else if (event.type === "error") {
          outcome.failed = { error: event.error, status: 200 };
        } else if (event.type === "cancelled") {
          outcome.cancelled = true;
        }
      };

      const transport = await runTurn(documentId, command, onEvent, controller.signal);
      outcome.failed ??= transport;
      outcome.cancelled ||= controller.signal.aborted;
      patch({ streaming: null });
      const { failed, cancelled } = outcome;
      if (failed) {
        if (failed.status === 401) router.replace(LOGIN_PATH);
        else patch({ turnError: toErrorView(failed.error, failed.status) });
      } else if (cancelled) {
        // Cancelar no es un fallo técnico, pero el turno queda sin respuesta: se ofrece reintentar.
        patch({ turnError: { kind: "cancelled", code: "TURN_CANCELLED", retryable: true, correlationId: null } });
      } else {
        lastCommand.current = null;
      }
      running.current = false;
      await sync();
      if (!failed && !cancelled && outcome.published) await contrast(controller.signal);
    },
    [documentId, contrast, patch, router, sync],
  );

  return (
    <ChatReference
      state={state}
      maxMessageChars={MAX_MESSAGE_CHARS}
      onSend={(content) => void execute({ clientMessageId: crypto.randomUUID(), content })}
      onCancel={() => abortRef.current?.abort()}
      onRetryTurn={() => {
        if (lastCommand.current) void execute(lastCommand.current);
        else {
          patch({ turnError: null });
          void sync();
        }
      }}
    />
  );
}
