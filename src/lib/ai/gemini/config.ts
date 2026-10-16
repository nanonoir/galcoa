import "server-only";

/**
 * Configuración del proveedor Gemini (MVP-050; D-05, MVP-013 §7.3 de
 * docs/specs/sources-and-ai.md). Los IDs y parámetros no son secretos y viven
 * aquí; la clave se lee **al invocar**, nunca al importar (SH-09): el build no
 * inicializa el proveedor ni falla sin variables.
 */

/** Modelo fijado por D-05 (selección técnica configurable, §7.2). */
export const GEMINI_MODEL_ID = "gemini-3.5-flash-lite";

/** Nombre de la variable que usa `@ai-sdk/google` 4.0.98 (verificado en su `dist`). */
export const GEMINI_API_KEY_ENV = "GOOGLE_GENERATIVE_AI_API_KEY";

/** Parámetros aprobados en MVP-013 (§7.3). */
export const GEMINI_LIMITS = {
  /** Contexto por llamada, incluyendo instrucciones. */
  maxContextTokens: 24_000,
  /** Salida por etapa; en Gemini incluye los tokens de razonamiento. */
  maxOutputTokens: 4_000,
  /** Plazo por etapa de IA. */
  stageTimeoutMs: 30_000,
  /**
   * Bytes de archivos enviados inline (§7.5): la solicitud inline completa se
   * limita a 20 MB; se reserva margen para texto e instrucciones. Más que eso
   * requiere Files API (MVP-043), nunca truncar.
   */
  maxInlineFileBytes: 19 * 1024 * 1024,
} as const;

/**
 * Razonamiento bajo para reducir latencia (§7.3, «Parámetros de generación»).
 * Temperatura y demás: valores por defecto del proveedor.
 */
export const GEMINI_THINKING_LEVEL = "low" as const;

export type GeminiConfig = {
  apiKey: string;
  modelId: string;
};

export type EnvReader = (name: string) => string | undefined;

const readProcessEnv: EnvReader = (name) => process.env[name];

/**
 * Devuelve la configuración o `null` si falta la clave. Nunca devuelve un
 * modelo alternativo ni un valor por defecto productivo.
 */
export function readGeminiConfig(readEnv: EnvReader = readProcessEnv): GeminiConfig | null {
  const apiKey = readEnv(GEMINI_API_KEY_ENV)?.trim();
  if (!apiKey) return null;
  return { apiKey, modelId: GEMINI_MODEL_ID };
}
