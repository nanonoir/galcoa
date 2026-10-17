import { MockLanguageModelV4 } from "ai/test";

import type { TestClock } from "../support/clock";

import { ScriptedBehavior, type Step } from "./scripted";

/**
 * Modelo Gemini guionado: se inyecta en `createModel` del puerto real
 * (`src/lib/ai/gemini/structured.ts`), que sigue ejecutando su validación Zod,
 * plazos y mapeo de errores. Complementa los dobles puntuales de
 * `tests/server/ai/gemini/doubles.ts`. Sin red ni credenciales.
 *
 * `ok`/`invalid` llevan el texto (o el objeto, que se serializa) que el «modelo» emite.
 */

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 30, reasoning: 10 },
};

type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];

export function scriptedGeminiModel(steps: readonly Step<unknown>[], clock?: TestClock) {
  const behavior = new ScriptedBehavior<CallOptions, unknown>(steps, clock);
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const value = await behavior.run(options, options.abortSignal);
      return {
        content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return { model, behavior };
}
