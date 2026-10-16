/**
 * Entrada del bundle de test que consume `MVP-121` desde el runner Node de Playwright
 * (nunca desde el navegador). Compone SOLO dependencias que le pasa `tests/server/`.
 *
 * PENDIENTE (productores): importar aquí las factories de handlers y el helper de contexto de
 * Auth que introducen sus planes (F4+; `src/lib/**`), con los puertos de Gemini/Groq/Storage/
 * HCS/Mirror como parámetros. Hoy no existen en `develop`; no se inventan. Cuando existan, esta
 * función las compondrá sin registry DI genérico ni lectura de entorno.
 */
export const BRIDGE_API_VERSION = 1 as const;

/** Congela las dependencias explícitas recibidas; no resuelve nada por nombre ni por entorno. */
export function createTestComposition<D extends Record<string, unknown>>(deps: D): Readonly<D> {
  return Object.freeze({ ...deps });
}
