import { z } from "zod";

import { MessageSchema, type Message } from "@/lib/contracts/core";
import { TechnicalErrorSchema, type TechnicalError } from "@/lib/contracts/technical";

/**
 * Cliente de red del chat (MVP-054): consume las rutas reales de `/api/documents/[id]`.
 * Solo se importa desde el container. No simula éxito: cualquier respuesta que no se pueda
 * validar vuelve como error técnico. `warnings` y `notInformed` del evento `draft` pueden
 * faltar (replay); no se rellenan.
 */

const IntSchema = z.number().int().nonnegative();

export const TurnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn.started"), turnId: z.string(), attempt: IntSchema, retried: z.boolean() }),
  z.object({ type: z.literal("user_message"), messageId: z.string() }),
  z.object({ type: z.literal("drafting") }),
  z.object({
    type: z.literal("draft"),
    draftId: z.string(),
    draftRevision: IntSchema,
    title: z.string(),
    warnings: IntSchema.optional(),
    notInformed: IntSchema.optional(),
  }),
  z.object({ type: z.literal("agent_message"), messageId: z.string(), content: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("cancelled") }),
  z.object({ type: z.literal("error"), error: TechnicalErrorSchema }),
]);

export type TurnStreamEvent = z.infer<typeof TurnEventSchema>;

const ContrastResponseSchema = z.object({
  result: z.object({
    result: z.enum(["sin_inconsistencias_criticas_detectadas", "con_advertencias", "contradiccion_critica"]),
    findings: z.array(z.object({ message: z.string(), severity: z.enum(["warning", "critical"]) })),
  }),
});

export type ContrastFinding = z.infer<typeof ContrastResponseSchema>["result"]["findings"][number];

const NETWORK: TechnicalError = { code: "NETWORK_ERROR", stage: "validacion", retryable: true, correlationId: "sin-referencia" };

export type ClientResult<T> = { ok: true; value: T } | { ok: false; error: TechnicalError; status: number };

const base = (documentId: string) => `/api/documents/${encodeURIComponent(documentId)}`;

async function errorFrom(response: Response): Promise<TechnicalError> {
  const parsed = z.object({ error: TechnicalErrorSchema }).safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error : { ...NETWORK, code: "UNEXPECTED_RESPONSE", retryable: response.status >= 500 };
}

export async function loadMessages(documentId: string, signal?: AbortSignal): Promise<ClientResult<Message[]>> {
  try {
    const response = await fetch(`${base(documentId)}/messages`, { credentials: "same-origin", signal });
    if (!response.ok) return { ok: false, error: await errorFrom(response), status: response.status };
    const parsed = z.object({ result: z.array(MessageSchema) }).safeParse(await response.json().catch(() => null));
    return parsed.success ? { ok: true, value: parsed.data.result } : { ok: false, error: { ...NETWORK, code: "UNEXPECTED_RESPONSE" }, status: 200 };
  } catch {
    return { ok: false, error: NETWORK, status: 0 };
  }
}

export async function requestContrast(documentId: string, signal?: AbortSignal): Promise<ClientResult<{ findings: ContrastFinding[] }>> {
  try {
    const response = await fetch(`${base(documentId)}/contrast`, { method: "POST", credentials: "same-origin", signal });
    if (!response.ok) return { ok: false, error: await errorFrom(response), status: response.status };
    const parsed = ContrastResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success
      ? { ok: true, value: { findings: parsed.data.result.findings } }
      : { ok: false, error: { ...NETWORK, code: "UNEXPECTED_RESPONSE" }, status: 200 };
  } catch {
    return { ok: false, error: NETWORK, status: 0 };
  }
}

export interface TurnCommand {
  clientMessageId: string;
  content: string;
}

/**
 * Abre el turno y entrega cada evento NDJSON en orden. Devuelve `null` si el flujo terminó con
 * un evento final (`done`, `cancelled` o `error`); si se cortó antes, o falló antes de abrirse,
 * devuelve el error técnico. Cancelar (`signal`) no es un error: devuelve `null`.
 */
export async function runTurn(
  documentId: string,
  command: TurnCommand,
  onEvent: (event: TurnStreamEvent) => void,
  signal: AbortSignal,
): Promise<{ error: TechnicalError; status: number } | null> {
  let finished = false;
  try {
    const response = await fetch(`${base(documentId)}/chat`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal,
    });
    if (!response.ok || !response.body) return { error: await errorFrom(response), status: response.status };
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    const handle = (line: string) => {
      if (!line.trim()) return;
      const event = TurnEventSchema.safeParse(JSON.parse(line));
      if (!event.success) throw new Error("evento inválido");
      if (event.data.type === "done" || event.data.type === "cancelled" || event.data.type === "error") finished = true;
      onEvent(event.data);
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
  } catch {
    if (signal.aborted) return null;
    if (finished) return null;
    return { error: NETWORK, status: 0 };
  }
  return finished ? null : { error: NETWORK, status: 0 };
}
