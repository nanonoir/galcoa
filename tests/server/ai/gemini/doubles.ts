import { MockLanguageModelV4 } from "ai/test";

/**
 * Dobles del modelo Gemini, exclusivos de tests (SH-09; plan F5 §3). El código
 * de producto nunca importa este archivo. Ninguno llama a la red.
 */

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 30, reasoning: 10 },
};

type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];

export type RecordedCall = { options: CallOptions };

/** Responde un JSON fijo con `finishReason` configurable. */
export function jsonModel(json: unknown, finishReason: "stop" | "length" = "stop") {
  const calls: RecordedCall[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      calls.push({ options });
      return {
        content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
        finishReason: { unified: finishReason, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return { model, calls };
}

/** Nunca responde: solo termina cuando se aborta su señal. */
export function hangingModel() {
  const calls: RecordedCall[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls.push({ options });
      return new Promise((_, reject) => {
        options.abortSignal?.addEventListener("abort", () => {
          reject(options.abortSignal?.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
    },
  });
  return { model, calls };
}

/** Falla siempre con el error dado (p. ej. un `APICallError`). */
export function failingModel(error: unknown) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
  });
  return { model };
}
