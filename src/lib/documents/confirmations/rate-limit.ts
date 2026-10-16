import "server-only";

import { createHash } from "node:crypto";

import { newId } from "../result";

import type { RateLimitKind, RateLimitStore } from "./ports";

/**
 * Límite de abuso de los endpoints públicos (MVP-075; docs/specs/public-capabilities.md §8).
 *
 * Ventana fija de 60 s, contador durable detrás de un puerto (Postgres, sin
 * servicio externo). 60 lecturas y 10 escrituras por minuto y origen, ambos
 * configurables. El origen sale del encabezado de IP de la plataforma y se
 * guarda solo como hash; no incluye el token ni datos privados. Cuando se
 * excede responde `429` con `Retry-After` sin ejecutar el handler (por lo que
 * **no consume el token**) y sin revelar qué clave se limitó. Si el contador
 * falla, cierra en falla: `503` reintentable, sin bypass silencioso.
 */

export type RateLimits = Record<RateLimitKind, { limit: number; windowSeconds: number }>;

export const DEFAULT_RATE_LIMITS: RateLimits = {
  read: { limit: 60, windowSeconds: 60 },
  write: { limit: 10, windowSeconds: 60 },
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "limited"; retryAfterSeconds: number }
  | { allowed: false; reason: "unavailable" };

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

/** Origen desde el encabezado de la plataforma; sin él, un único cubo compartido. */
export function originOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "desconocido";
}

export function createRateLimiter(deps: { store: RateLimitStore; now?: () => number; limits?: Partial<RateLimits> }) {
  const now = deps.now ?? (() => Date.now());
  const limits: RateLimits = { ...DEFAULT_RATE_LIMITS, ...deps.limits };

  async function check(kind: RateLimitKind, request: Request): Promise<RateLimitDecision> {
    const { limit, windowSeconds } = limits[kind];
    const nowSeconds = Math.floor(now() / 1000);
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const originHash = createHash("sha256").update(`${kind}|${originOf(request)}`).digest("hex");
    try {
      const { count } = await deps.store.hit({ kind, originHash, windowStart });
      if (count <= limit) return { allowed: true };
      return { allowed: false, reason: "limited", retryAfterSeconds: Math.max(1, windowStart + windowSeconds - nowSeconds) };
    } catch {
      return { allowed: false, reason: "unavailable" };
    }
  }

  /** Envuelve un handler: si no está permitido, ni se ejecuta (el token no se lee ni se consume). */
  function limited<A extends unknown[]>(kind: RateLimitKind, handler: (request: Request, ...args: A) => Promise<Response>) {
    return async (request: Request, ...args: A): Promise<Response> => {
      const decision = await check(kind, request);
      if (decision.allowed) return handler(request, ...args);
      const correlationId = newId();
      if (decision.reason === "limited") {
        return Response.json(
          { error: { code: "RATE_LIMITED", stage: "validacion", retryable: true, correlationId } },
          { status: 429, headers: { ...HEADERS, "Retry-After": String(decision.retryAfterSeconds) } },
        );
      }
      return Response.json(
        { error: { code: "RATE_LIMIT_UNAVAILABLE", stage: "persistencia", retryable: true, correlationId } },
        { status: 503, headers: HEADERS },
      );
    };
  }

  return { check, limited };
}
