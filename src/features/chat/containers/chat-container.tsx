"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { uploadReservedEvidence } from "@/features/auth/containers/supabase-browser";
import { ChatReference } from "@/features/chat/components/chat-reference";
import type { ChatAttachmentView, ChatErrorView, ChatMessageView, ChatViewState } from "@/features/chat/contracts/chat-view";
import type { Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";

import { loadMessages, requestContrast, runTurn, type TurnCommand, type TurnStreamEvent } from "./chat-client";
import { completeEvidence, extractEvidence, precheckEvidence, reserveEvidence, sha256Hex } from "./evidence-client";

/**
 * Container del chat (MVP-054): consume `POST /api/documents/[id]/chat` (NDJSON) y
 * `.../contrast`. El historial siempre sale del servidor; lo local es transitorio (mensaje en
 * envío, avance del turno). Cancelar aborta la petición; reintentar reutiliza el mismo
 * `clientMessageId` para no duplicar el mensaje. El contraste corre tras un borrador publicado
 * y su fallo no bloquea el chat. Nunca se muestra éxito sin confirmación del servidor.
 *
 * Adjuntos: reservar → subir a Storage → completar (el servidor revalida bytes y hash) → extraer.
 * Reintentar retoma desde la etapa pendiente y reutiliza la clave de idempotencia. Si la extracción
 * se completa y ya hay un borrador publicado, se vuelve a contrastar; el contraste no bloquea.
 */

const LOGIN_PATH = "/acceso";
const MAX_MESSAGE_CHARS = 8000;

const toView = (m: Message): ChatMessageView => ({ messageId: m.messageId, sender: m.sender, content: m.content, sentAt: m.uploadedAt });

function toErrorView(error: TechnicalError, status: number): ChatErrorView {
  const kind =
    status === 0 ? "network" : status === 401 || status === 403 || error.stage === "autenticacion" ? "permissions" : error.stage === "ia" ? "provider" : "other";
  return { kind, code: error.code, retryable: error.retryable, correlationId: error.correlationId };
}

/** Estado de una carga en curso: permite reintentar sin repetir etapas ya confirmadas por el servidor. */
interface AttachmentRecord {
  file: File;
  key: string;
  sha256?: string;
  reservation?: { evidenceId: string; upload: unknown };
  uploaded: boolean;
  accepted: boolean;
  rekeyed: boolean;
}

const CLEAN = { progress: null, reasonCode: null, retryable: false } as const;

const EMPTY: ChatViewState = { messages: [], streaming: null, attachments: [], contrast: "idle", turnError: null, draft: null };

export function ChatContainer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ChatViewState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const lastCommand = useRef<TurnCommand | null>(null);
  const running = useRef(false);
  const draftPublished = useRef(false);
  const records = useRef(new Map<string, AttachmentRecord>());
  const lifecycle = useRef(new AbortController());

  const patch = useCallback((next: Partial<ChatViewState>) => setState((current) => ({ ...current, ...next })), []);

  const sync = useCallback(async () => {
    const result = await loadMessages(documentId);
    if (result.ok) patch({ messages: result.value.map(toView) });
    else if (result.status === 401) router.replace(LOGIN_PATH);
    else patch({ turnError: toErrorView(result.error, result.status) });
  }, [documentId, patch, router]);

  useEffect(() => {
    lifecycle.current = new AbortController();
    const uploads = lifecycle.current;
    const initial = new AbortController();
    void loadMessages(documentId, initial.signal).then((result) => {
      if (initial.signal.aborted) return;
      if (result.ok) setState((current) => ({ ...current, messages: result.value.map(toView) }));
      else if (result.status === 401) router.replace(LOGIN_PATH);
      else setState((current) => ({ ...current, turnError: toErrorView(result.error, result.status) }));
    });
    return () => {
      initial.abort();
      uploads.abort();
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
          draftPublished.current = true;
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

  const runAttachment = useCallback(
    async (attachmentId: string) => {
      const record = records.current.get(attachmentId);
      if (!record) return;
      const signal = lifecycle.current.signal;
      const put = (next: Partial<ChatAttachmentView>) =>
        setState((current) => ({
          ...current,
          attachments: current.attachments.map((a) => (a.attachmentId === attachmentId ? { ...a, ...CLEAN, ...next } : a)),
        }));
      const stop = (error: TechnicalError, status: number, extraction = false) => {
        if (signal.aborted) return;
        if (status === 401) router.replace(LOGIN_PATH);
        else if (extraction && !error.retryable) put({ status: "uploaded_without_extraction" });
        else {
          const rejected = !extraction && error.stage === "validacion" && !error.retryable;
          put({ status: rejected ? "rejected" : "failed", reasonCode: error.code, retryable: error.retryable });
        }
      };

      if (!record.accepted) {
        put({ status: "uploading" });
        try {
          record.sha256 ??= await sha256Hex(record.file);
        } catch {
          return stop({ code: "FILE_UNREADABLE", stage: "validacion", retryable: true, correlationId: "sin-referencia" }, 0);
        }
        if (!record.reservation) {
          let reserved = await reserveEvidence(documentId, record.file, record.sha256, record.key, signal);
          // Una reserva vencida no se renueva: se pide otra con clave nueva y el servidor revalida cuotas.
          if (!reserved.ok && reserved.error.code === "NOT_AVAILABLE" && !record.rekeyed) {
            record.key = crypto.randomUUID();
            record.rekeyed = true;
            reserved = await reserveEvidence(documentId, record.file, record.sha256, record.key, signal);
          }
          if (!reserved.ok) return stop(reserved.error, reserved.status);
          record.reservation = reserved.value;
          record.uploaded = reserved.value.upload === null;
        }
        if (!record.uploaded) {
          try {
            await uploadReservedEvidence(record.reservation.upload, record.file);
            record.uploaded = true;
          } catch {
            return stop({ code: "STORAGE_FAILURE", stage: "persistencia", retryable: true, correlationId: "sin-referencia" }, 0);
          }
        }
        const completed = await completeEvidence(documentId, record.reservation.evidenceId, signal);
        if (!completed.ok) return stop(completed.error, completed.status);
        record.accepted = true;
      }

      put({ status: "extracting" });
      const extracted = await extractEvidence(documentId, record.reservation!.evidenceId, signal);
      if (!extracted.ok) return stop(extracted.error, extracted.status, true);
      put({ status: "extracted" });
      records.current.delete(attachmentId);
      // La extracción es insumo nuevo del borrador vigente; si hay un turno en curso, él contrasta al terminar.
      if (draftPublished.current && !running.current) await contrast(signal);
    },
    [contrast, documentId, router],
  );

  const attach = useCallback(
    (files: File[]) => {
      const queued: string[] = [];
      const added: ChatAttachmentView[] = files.map((file) => {
        const attachmentId = crypto.randomUUID();
        const base = { attachmentId, fileName: file.name, byteLength: file.size, ...CLEAN };
        const rejection = precheckEvidence(file);
        if (rejection) return { ...base, status: "rejected", reasonCode: rejection.code };
        records.current.set(attachmentId, { file, key: crypto.randomUUID(), uploaded: false, accepted: false, rekeyed: false });
        queued.push(attachmentId);
        return { ...base, status: "uploading" };
      });
      setState((current) => ({ ...current, attachments: [...current.attachments, ...added] }));
      // En serie: las cuotas por documento se comprueban bajo bloqueo y el orden queda predecible.
      void (async () => {
        for (const attachmentId of queued) await runAttachment(attachmentId);
      })();
    },
    [runAttachment],
  );

  return (
    <ChatReference
      state={state}
      maxMessageChars={MAX_MESSAGE_CHARS}
      onSend={(content) => void execute({ clientMessageId: crypto.randomUUID(), content })}
      onAttach={attach}
      onRetryAttachment={(attachmentId) => void runAttachment(attachmentId)}
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
