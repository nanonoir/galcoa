import type { GroqChatClient } from "@/lib/ai/groq/structured";

import type { TestClock } from "../support/clock";

import { ScriptedBehavior, type Step } from "./scripted";

/**
 * Cliente Groq guionado: se inyecta en `createClient` del puerto real
 * (`src/lib/ai/groq/structured.ts`), que sigue ejecutando su validación Zod, plazos y
 * mapeo de errores. Sin red ni credenciales ni `groq-sdk`.
 *
 * `ok`/`invalid` llevan el JSON (objeto o texto) que el «modelo» emite como contenido.
 * `fail` lanza el error tal cual (p. ej. un `APIError` armado por el test).
 */

type CreateParams = Parameters<GroqChatClient["chat"]["completions"]["create"]>[0];

export function scriptedGroqClient(steps: readonly Step<unknown>[], clock?: TestClock) {
  const behavior = new ScriptedBehavior<CreateParams, unknown>(steps, clock);
  const create = async (params: CreateParams, options?: { signal?: AbortSignal }) => {
    const value = await behavior.run(params, options?.signal);
    return {
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: typeof value === "string" ? value : JSON.stringify(value) } }],
    };
  };
  const client = { chat: { completions: { create } } } as unknown as GroqChatClient;
  return { client, behavior };
}

/** Respuesta cortada por límite de salida: el puerto debe tratarla como incompleta. */
export function truncatedGroqClient() {
  const create = async () => ({ choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "{" } }] });
  return { chat: { completions: { create } } } as unknown as GroqChatClient;
}
