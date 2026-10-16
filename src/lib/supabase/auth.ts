import "server-only";

import { randomUUID } from "node:crypto";

import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";

import type { TechnicalError } from "@/lib/contracts/technical";
import type { SessionPort } from "@/lib/documents/ports";

import { getSessionClient } from "./session";

/**
 * Sesión verificada y guardas (MVP-030; SH-02, SH-07).
 *
 * La identidad se confirma con el servidor de Auth (`auth.getUser()`), no con
 * los datos de la cookie. Tres resultados posibles: usuario verificado, sin
 * sesión (cookie ausente, inválida o vencida) o error técnico del proveedor,
 * que **nunca** se trata como éxito ni como anónimo silencioso.
 */

export const LOGIN_PATH = "/acceso";

/** Cabeceras para respuestas privadas: ninguna caché compartida ni `Referer` con datos. */
export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;

export type VerifiedUser = { id: string; email: string | null };

export type SessionCheck =
  | { status: "authenticated"; user: VerifiedUser }
  | { status: "anonymous" }
  | { status: "unavailable" };

type AuthClient = Pick<SupabaseClient, "auth">;

export async function verifySession(client: AuthClient): Promise<SessionCheck> {
  let result;
  try {
    result = await client.auth.getUser();
  } catch (error) {
    return isAuthSessionMissingError(error) ? { status: "anonymous" } : { status: "unavailable" };
  }
  const { data, error } = result;
  if (error) {
    if (isAuthSessionMissingError(error)) return { status: "anonymous" };
    if (isAuthRetryableFetchError(error)) return { status: "unavailable" };
    // Token inválido, vencido o usuario inexistente: sin sesión. Un 5xx es del proveedor.
    if (isAuthApiError(error) && error.status >= 400 && error.status < 500) return { status: "anonymous" };
    return { status: "unavailable" };
  }
  if (!data.user?.id) return { status: "anonymous" };
  return { status: "authenticated", user: { id: data.user.id, email: data.user.email ?? null } };
}

/** El proveedor de Auth falló: impedimento técnico, no «sin sesión». */
export class SessionUnavailableError extends Error {
  readonly code = "AUTH_UNAVAILABLE";
  readonly stage = "autenticacion";
  readonly retryable = true;
  constructor() {
    super("No se pudo verificar la sesión.");
    this.name = "SessionUnavailableError";
  }
}

/**
 * `SessionPort` de los servicios (F4, F5): `null` sin sesión. Si el proveedor
 * falla, lanza `SessionUnavailableError` para que la capa HTTP responda 503.
 */
export function createSessionPort(client: AuthClient): SessionPort {
  let cached: Promise<SessionCheck> | null = null;
  return {
    async currentUserId() {
      cached ??= verifySession(client);
      const check = await cached;
      if (check.status === "unavailable") throw new SessionUnavailableError();
      return check.status === "authenticated" ? check.user.id : null;
    },
  };
}

/** Usuario de la petición actual (Server Components, Route Handlers y Server Actions). */
export async function getCurrentSession(): Promise<SessionCheck> {
  return verifySession(await getSessionClient());
}

/** Guarda de páginas privadas: sin sesión redirige al acceso; si Auth falla, error técnico. */
export async function requirePageUser(check: () => Promise<SessionCheck> = getCurrentSession): Promise<VerifiedUser> {
  const session = await check();
  if (session.status === "authenticated") return session.user;
  if (session.status === "unavailable") throw new SessionUnavailableError();
  const { redirect } = await import("next/navigation");
  return redirect(LOGIN_PATH);
}

function errorResponse(status: number, error: TechnicalError): Response {
  return Response.json({ error }, { status, headers: PRIVATE_RESPONSE_HEADERS });
}

/**
 * Patrón para Route Handlers privados: verifica la sesión antes del handler y
 * responde un envelope estable si no hay. Cada servicio vuelve a autorizar la
 * operación concreta (propiedad), además de RLS.
 */
export function withApiUser<Ctx>(
  handler: (request: Request, context: Ctx, user: VerifiedUser) => Promise<Response>,
  check: () => Promise<SessionCheck> = getCurrentSession,
) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    const correlationId = randomUUID();
    let session: SessionCheck;
    try {
      session = await check();
    } catch {
      session = { status: "unavailable" };
    }
    if (session.status === "anonymous") {
      return errorResponse(401, { code: "NO_SESSION", stage: "autenticacion", retryable: false, correlationId });
    }
    if (session.status === "unavailable") {
      return errorResponse(503, { code: "AUTH_UNAVAILABLE", stage: "autenticacion", retryable: true, correlationId });
    }
    const response = await handler(request, context, session.user);
    for (const [key, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) response.headers.set(key, value);
    return response;
  };
}
