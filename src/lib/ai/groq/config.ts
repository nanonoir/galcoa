import "server-only";

/**
 * Configuración del proveedor Groq (MVP-053; D-05, MVP-013 §7.3 de
 * docs/specs/sources-and-ai.md). La clave se lee al invocar, nunca al importar.
 */

/** Modelo fijado por D-05 (selección técnica configurable, §7.2). */
export const GROQ_MODEL_ID = "openai/gpt-oss-120b";

/** Variable que usa `groq-sdk` por defecto. */
export const GROQ_API_KEY_ENV = "GROQ_API_KEY";

/** Parámetros aprobados en MVP-013 (§7.3). */
export const GROQ_LIMITS = {
  maxContextTokens: 24_000,
  maxOutputTokens: 4_000,
  stageTimeoutMs: 30_000,
} as const;

/** Razonamiento bajo (§7.3, «Parámetros de generación»). */
export const GROQ_REASONING_EFFORT = "low" as const;

export type GroqConfig = { apiKey: string; modelId: string };
export type EnvReader = (name: string) => string | undefined;

export function readGroqConfig(readEnv: EnvReader = (name) => process.env[name]): GroqConfig | null {
  const apiKey = readEnv(GROQ_API_KEY_ENV)?.trim();
  return apiKey ? { apiKey, modelId: GROQ_MODEL_ID } : null;
}
