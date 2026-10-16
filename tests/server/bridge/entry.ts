import { createContrastService } from "@/lib/ai/groq/contrast";
import { createEvidenceService } from "@/lib/documents/evidence/service";
import { createChatTurnHandler } from "@/lib/documents/turns/http";
import { createTurnService } from "@/lib/documents/turns/service";
import { createVerificationService } from "@/lib/documents/verification/service";
import { createMirrorReader } from "@/lib/hedera/mirror";

/**
 * Entrada del bundle de test que consume `MVP-121` desde el runner Node de Playwright
 * (nunca desde el navegador). Compone SOLO dependencias que le pasa `tests/server/`:
 * sesión, almacenes y puertos de Gemini/Groq/Storage/HCS/Mirror llegan como parámetros;
 * aquí no se lee entorno ni se resuelve nada por nombre (sin registry DI genérico).
 *
 * Cubre las factories de servicio/handler que existen hoy en `src/lib/**`. PENDIENTE: el
 * helper de contexto de Auth que valide cookies contra Auth local. `src/lib/supabase/auth.ts`
 * lo ofrece (`createSessionPort`/`createSessionClient`) pero su cliente usa `@supabase/ssr`,
 * que no está en la lista permitida de los guards, y el módulo vecino `session.ts` importa
 * `next/headers` de forma dinámica (solo lo elimina el tree-shaking). Incorporarlo exige
 * decidir esa lista y estabilizar el módulo (flujo de Auth, MVP-030): no se relaja el guard
 * ni se inventa un `userId`. Mientras tanto la sesión entra como `SessionPort` explícito.
 */
export const BRIDGE_API_VERSION = 1 as const;

/** Congela las dependencias explícitas recibidas; no resuelve nada por nombre ni por entorno. */
export function createTestComposition<D extends Record<string, unknown>>(deps: D): Readonly<D> {
  return Object.freeze({ ...deps });
}

export type BridgeDeps = {
  turn: Parameters<typeof createTurnService>[0];
  evidence: Parameters<typeof createEvidenceService>[0];
  contrast: Parameters<typeof createContrastService>[0];
  verification: Parameters<typeof createVerificationService>[0];
};

/** Servicios y handlers reales de `src/lib/**` cableados a las dependencias recibidas. */
export function createBridgeHandlers(deps: BridgeDeps) {
  const turnService = createTurnService(deps.turn);
  return createTestComposition({
    version: BRIDGE_API_VERSION,
    chatTurn: createChatTurnHandler(async () => turnService),
    evidence: createEvidenceService(deps.evidence),
    contrast: createContrastService(deps.contrast),
    verification: createVerificationService(deps.verification),
  });
}

export { createMirrorReader };
