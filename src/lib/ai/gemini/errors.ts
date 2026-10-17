import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

/**
 * Errores técnicos estables de la etapa de IA (spec sources-and-ai §4; SH-02).
 * Un error técnico no es una advertencia de contenido: nunca se convierte en
 * borrador ni reporte. Los mensajes no incluyen claves, prompts ni fuentes.
 */
export const GEMINI_ERROR_CODES = {
  /** Falta la clave del proveedor. Sin fallback. */
  configMissing: "AI_CONFIG_MISSING",
  /** La entrada no cumple el puerto (p. ej. intenta registrar herramientas). */
  invalidInput: "AI_INVALID_INPUT",
  /** La entrada estimada supera el contexto aprobado; no se trunca. */
  contextExceeded: "AI_CONTEXT_EXCEEDED",
  /** Se agotó el plazo de la etapa. */
  timeout: "AI_TIMEOUT",
  /** El llamador canceló la operación. */
  aborted: "AI_ABORTED",
  /** La respuesta no cumple el esquema. */
  invalidOutput: "AI_INVALID_OUTPUT",
  /** La respuesta quedó cortada (tope de salida o filtro). */
  incompleteOutput: "AI_INCOMPLETE_OUTPUT",
  /** Falla de red o del proveedor. */
  providerError: "AI_PROVIDER_ERROR",
} as const;

export type GeminiErrorCode = (typeof GEMINI_ERROR_CODES)[keyof typeof GEMINI_ERROR_CODES];

export function geminiTechnicalError(
  code: GeminiErrorCode,
  retryable: boolean,
  correlationId: string,
): TechnicalError {
  return { code, stage: "ia", retryable, correlationId };
}
