import { createContrastService } from "@/lib/ai/groq/contrast";
import { createEvidenceService } from "@/lib/documents/evidence/service";
import { createChatTurnHandler } from "@/lib/documents/turns/http";
import { createTurnService } from "@/lib/documents/turns/service";
import { createVerificationService } from "@/lib/documents/verification/service";
import { createMirrorReader } from "@/lib/hedera/mirror";
import { createSessionPort } from "@/lib/supabase/auth";
import { createSessionClient, type CookieToSet, type RequestCookieStore } from "@/lib/supabase/session";

export interface LocalAuthContextInput {
  url: string;
  publishableKey: string;
  cookies: ReturnType<RequestCookieStore["getAll"]>;
}

/** Configuración efímera del CLI local; nunca lee archivos de entorno ni acepta identidad. */
export function createLocalAuthContext(input: LocalAuthContextInput) {
  const url = new URL(input.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "54321" ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Auth del puente requiere http://127.0.0.1:54321");
  }
  // El pipeline de servicios nunca recibe la clave privilegiada del seed.
  let publicKey = input.publishableKey.startsWith("sb_publishable_");
  try {
    const claims: unknown = JSON.parse(Buffer.from(input.publishableKey.split(".")[1], "base64url").toString());
    publicKey ||= typeof claims === "object" && claims !== null && "role" in claims && claims.role === "anon";
  } catch { /* No es una clave pública JWT local. */ }
  if (!publicKey) throw new Error("Auth del puente requiere una clave pública");
  const cookieChanges: CookieToSet[] = [];
  const cookieHeaders: Record<string, string> = {};
  const client = createSessionClient({
    getAll: () => input.cookies.map(({ name, value }) => ({ name, value })),
    setAll: (changes, headers) => {
      cookieChanges.push(...changes);
      Object.assign(cookieHeaders, headers);
    },
  }, { readEnv: (name) => name === "NEXT_PUBLIC_SUPABASE_URL" ? url.origin :
    name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ? input.publishableKey : undefined });
  return { session: createSessionPort(client), cookieChanges, cookieHeaders };
}

/**
 * Entrada del bundle de test que consume `MVP-121` desde el runner Node de Playwright
 * (nunca desde el navegador). Compone SOLO dependencias que le pasa `tests/server/`:
 * sesión, almacenes y puertos de Gemini/Groq/Storage/HCS/Mirror llegan como parámetros;
 * aquí no se lee entorno ni se resuelve nada por nombre (sin registry DI genérico).
 *
 * Auth usa las mismas factories de producto: los imports nombrados eliminan los helpers
 * Next no usados; los guards comprueban el artefacto resultante, sin permitir Next.
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
