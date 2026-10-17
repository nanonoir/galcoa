"use client";

import { AlertTriangle, FileText, Info, Paperclip, RotateCcw, Send, Square } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChatAttachmentStatus,
  ChatAttachmentView,
  ChatContrastStatus,
  ChatErrorKind,
  ChatMessageView,
  ChatViewProps,
} from "@/features/chat/contracts/chat-view";

/**
 * Presentación del chat de un documento (MVP-054, REQ-03). Solo formatea lo
 * recibido y delega cada acción en callbacks: no hace red, no decide éxito de
 * persistencia ni de extracción. Un impedimento técnico se muestra como tal,
 * separado de las advertencias de contenido, y nunca como éxito.
 */

// Records exhaustivos: si el contrato añade un valor, TypeScript obliga a etiquetarlo.
const errorTitles: Record<ChatErrorKind, string> = {
  network: "Sin conexión con el servidor",
  provider: "El proveedor de IA no respondió",
  storage: "No se pudo guardar el archivo",
  permissions: "No tenés permiso para esta acción",
  cancelled: "Respuesta cancelada",
  other: "Ocurrió un problema técnico",
};

const errorDetails: Record<ChatErrorKind, string> = {
  network: "La respuesta no llegó. Tu mensaje no se confirmó como enviado.",
  provider: "No se generó la respuesta del asistente. Tu mensaje original se conserva.",
  storage: "El almacenamiento no confirmó la operación.",
  permissions: "Tu sesión no puede realizar esta operación en este documento.",
  cancelled: "Tu mensaje se conserva. Podés reintentar la respuesta.",
  other: "La operación no se completó.",
};

const attachmentLabels: Record<ChatAttachmentStatus, string> = {
  uploading: "Cargando",
  uploaded: "Cargado",
  extracting: "Extrayendo texto",
  extracted: "Texto extraído",
  uploaded_without_extraction: "Cargado sin extracción",
  rejected: "Rechazado",
  failed: "No se pudo cargar",
};

const contrastLabels: Record<ChatContrastStatus, string | null> = {
  idle: null,
  running: "Contrastando fuentes…",
  done: "Contraste disponible",
  unavailable: "Contraste no disponible",
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  return `${dateFormat.format(new Date(iso))} UTC`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Message({ message }: { message: ChatMessageView }) {
  const author = message.sender === "autor";
  return (
    <li className={author ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          author
            ? "max-w-[85%] min-w-0 rounded-lg bg-primary/10 p-3"
            : "max-w-[85%] min-w-0 rounded-lg border border-border bg-muted/40 p-3"
        }
      >
        <p className="text-xs text-muted-foreground">
          {author ? "Vos" : "Asistente"} · {formatDate(message.sentAt)}
        </p>
        <p className="mt-1 break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    </li>
  );
}

function Attachment({
  attachment,
  onRetry,
}: {
  attachment: ChatAttachmentView;
  onRetry: (attachmentId: string) => void;
}) {
  const failed = attachment.status === "rejected" || attachment.status === "failed";
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <Paperclip aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-all">{attachment.fileName}</span>
      <span className="text-xs text-muted-foreground">{formatBytes(attachment.byteLength)}</span>
      <Badge variant={failed ? "destructive" : "outline"}>{attachmentLabels[attachment.status]}</Badge>
      {attachment.status === "uploading" && attachment.progress !== null ? (
        <progress
          className="h-2 w-24"
          max={100}
          value={attachment.progress}
          aria-label={`Progreso de carga de ${attachment.fileName}`}
        />
      ) : null}
      {failed && attachment.reasonCode ? (
        <span className="text-xs break-words text-muted-foreground">Motivo: {attachment.reasonCode}</span>
      ) : null}
      {failed && attachment.retryable ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onRetry(attachment.attachmentId)}>
          <RotateCcw aria-hidden="true" />
          Reintentar carga de {attachment.fileName}
        </Button>
      ) : null}
    </li>
  );
}

export function ChatReference({
  state,
  maxMessageChars,
  onSend,
  onCancel,
  onRetryTurn,
  onAttach,
  onRetryAttachment,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = state.streaming !== null;
  const tooLong = draft.length > maxMessageChars;
  // El borrador se conserva tras `onSend` hasta que el estado recibido lo confirme
  // (mensaje nuevo en el historial) o informe un error: un envío fallido no pierde el texto.
  const [sent, setSent] = useState<{ content: string; count: number; error: unknown } | null>(null);
  if (sent && state.messages.length > sent.count) {
    setSent(null);
    if (draft === sent.content) setDraft("");
  }
  const awaitingAck =
    sent !== null && draft === sent.content && state.messages.length === sent.count && state.turnError === sent.error;
  const canSend = !busy && !awaitingAck && !tooLong && draft.trim().length > 0;
  const contrastLabel = contrastLabels[state.contrast];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setSent({ content: draft, count: state.messages.length, error: state.turnError });
    try {
      onSend(draft);
    } catch {
      // Fallo técnico del callback: el texto queda en el composer para reintentar.
      setSent(null);
    }
    textareaRef.current?.focus();
  }

  function cancel() {
    onCancel();
    textareaRef.current?.focus();
  }

  return (
    <section aria-label="Chat del documento" className="flex min-w-0 flex-col gap-4">
      {state.messages.length === 0 && state.streaming === null ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay mensajes. Contá la operación con tus palabras o adjuntá un archivo.
        </p>
      ) : (
        <ol role="log" aria-label="Mensajes" aria-live="polite" className="flex flex-col gap-3">
          {state.messages.map((message) => (
            <Message key={message.messageId} message={message} />
          ))}
          {state.streaming ? (
            <li className="flex justify-start">
              <div className="max-w-[85%] min-w-0 rounded-lg border border-border bg-muted/40 p-3" aria-busy="true">
                <p className="text-xs text-muted-foreground">Asistente · respondiendo…</p>
                <p className="mt-1 break-words whitespace-pre-wrap">{state.streaming.content}</p>
              </div>
            </li>
          ) : null}
        </ol>
      )}

      {state.turnError ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{errorTitles[state.turnError.kind]}</AlertTitle>
          <AlertDescription>
            <p>{errorDetails[state.turnError.kind]}</p>
            <p className="text-xs break-words">
              Código: {state.turnError.code}
              {state.turnError.correlationId ? ` · Referencia: ${state.turnError.correlationId}` : ""}
            </p>
            {state.turnError.retryable ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetryTurn}>
                <RotateCcw aria-hidden="true" />
                Reintentar respuesta
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.draft ? (
        <Alert role="status">
          <FileText aria-hidden="true" />
          <AlertTitle>Borrador «{state.draft.title}» actualizado (revisión {state.draft.draftRevision})</AlertTitle>
          {state.draft.warnings !== undefined || state.draft.notInformed !== undefined ? (
            <AlertDescription>
              {state.draft.warnings !== undefined ? <p>Advertencias para revisar: {state.draft.warnings}. No bloquean el avance.</p> : null}
              {state.draft.notInformed !== undefined ? <p>Datos «no informados»: {state.draft.notInformed}.</p> : null}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      {state.contrastFindings && state.contrastFindings.length > 0 ? (
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertTitle>Avisos del contraste (no bloquean)</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {state.contrastFindings.map((finding, index) => (
                <li key={index}>
                  {finding.severity === "critical" ? "Posible contradicción: " : "Advertencia: "}
                  {finding.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.attachments.length > 0 ? (
        <ul aria-label="Adjuntos" className="flex flex-col gap-2">
          {state.attachments.map((attachment) => (
            <Attachment key={attachment.attachmentId} attachment={attachment} onRetry={(id) => onRetryAttachment?.(id)} />
          ))}
        </ul>
      ) : null}

      <p role="status" className="text-sm text-muted-foreground">
        {contrastLabel}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <Label htmlFor="chat-composer">Mensaje</Label>
        <Textarea
          id="chat-composer"
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={tooLong}
          aria-describedby="chat-composer-count"
        />
        <p id="chat-composer-count" className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {draft.length} / {maxMessageChars} caracteres
          {tooLong ? ". El mensaje supera el límite y no se enviará." : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            data-testid="chat-file-input"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) onAttach?.(files);
              event.target.value = "";
            }}
          />
          {onAttach ? (
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Paperclip aria-hidden="true" />
              Adjuntar archivo
            </Button>
          ) : null}
          {busy ? (
            <Button type="button" variant="outline" onClick={cancel}>
              <Square aria-hidden="true" />
              Cancelar respuesta
            </Button>
          ) : null}
          <Button type="submit" disabled={!canSend}>
            <Send aria-hidden="true" />
            Enviar
          </Button>
        </div>
      </form>
    </section>
  );
}
