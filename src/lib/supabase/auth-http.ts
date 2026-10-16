import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import { AuthFormStateSchema, type AuthFormState } from "@/lib/contracts/auth-forms";

import { PRIVATE_RESPONSE_HEADERS } from "./auth";
import {
  callbackFlow,
  INVALID_LINK_PATH,
  loginFlow,
  loginSchema,
  logoutFlow,
  MESSAGES,
  newPasswordFlow,
  newPasswordSchema,
  recoveryRequestFlow,
  recoverySchema,
  registerFlow,
  registerSchema,
  toFieldErrors,
  type FlowResult,
} from "./auth-flows";
import { SupabaseConfigError } from "./config";
import { getSessionClient } from "./session";

/**
 * Capa HTTP delgada de los Route Handlers de Auth (MVP-031). Solo POST con JSON
 * y mismo origen (defensa CSRF además de `SameSite` de las cookies), respuestas
 * sin caché ni `Referer`, y cuerpo `{ state, redirectTo? }` que el container
 * traduce al estado de la presentación. Nada de esto se ejecuta al importar.
 */

type AuthClient = Pick<SupabaseClient, "auth">;

export type AuthHttpDeps = { getClient?: () => Promise<AuthClient> };

const STATUS: Record<Extract<FlowResult, { ok: false }>["kind"], number> = {
  invalid: 422,
  credentials: 401,
  no_session: 401,
  rate_limited: 429,
  unavailable: 503,
};

function respond(status: number, state: AuthFormState, redirectTo?: string): Response {
  return Response.json(
    { state: AuthFormStateSchema.parse(state), ...(redirectTo ? { redirectTo } : {}) },
    { status, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

const errorState = (message: string): AuthFormState => ({ status: "error", message, fieldErrors: [] });

/**
 * Origen de la petición si su host coincide con el que el cliente usó para llegar
 * al servidor (`Host` o `X-Forwarded-Host`); `null` en cualquier otro caso. Se
 * compara con las cabeceras y no con `request.url`, que Next puede normalizar
 * (p. ej. `127.0.0.1` → `localhost`). Un sitio externo no puede falsificar `Origin`.
 */
export function sameOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const source = new URL(origin);
    if (source.protocol !== "http:" && source.protocol !== "https:") return null;
    const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host"), new URL(request.url).host];
    return hosts.some((host) => host && host.toLowerCase() === source.host) ? source.origin : null;
  } catch {
    return null;
  }
}

function toResponse(result: FlowResult): Response {
  if (result.ok) return respond(200, { status: "success", message: result.message }, result.redirectTo);
  const message = result.message ?? (result.fieldErrors.length === 0 ? MESSAGES.invalidData : null);
  return respond(STATUS[result.kind], { status: "error", message, fieldErrors: result.fieldErrors });
}

type PostFlow<S extends z.ZodType | null> = {
  schema: S;
  run: (client: AuthClient, values: S extends z.ZodType ? z.output<S> : undefined, ctx: { origin: string }) => Promise<FlowResult>;
};

async function handle<S extends z.ZodType | null>(request: Request, flow: PostFlow<S>, deps: AuthHttpDeps): Promise<Response> {
  const origin = sameOrigin(request);
  if (!origin) return respond(403, errorState(MESSAGES.invalidData));
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond(415, errorState(MESSAGES.invalidData));
  }

  let values: unknown;
  if (flow.schema) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond(400, errorState(MESSAGES.invalidData));
    }
    const parsed = flow.schema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);
      return respond(422, { status: "error", message: fieldErrors.length > 0 ? null : MESSAGES.invalidData, fieldErrors });
    }
    values = parsed.data;
  }

  let client: AuthClient;
  try {
    client = await (deps.getClient ?? getSessionClient)();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return respond(503, errorState(MESSAGES.unavailable));
    throw error;
  }
  return toResponse(await flow.run(client, values as never, { origin }));
}

export const handleRegister = (request: Request, deps: AuthHttpDeps = {}) =>
  handle(request, { schema: registerSchema, run: registerFlow }, deps);
export const handleLogin = (request: Request, deps: AuthHttpDeps = {}) =>
  handle(request, { schema: loginSchema, run: (client, values) => loginFlow(client, values) }, deps);
export const handleLogout = (request: Request, deps: AuthHttpDeps = {}) =>
  handle(request, { schema: null, run: (client) => logoutFlow(client) }, deps);
export const handleRecoveryRequest = (request: Request, deps: AuthHttpDeps = {}) =>
  handle(request, { schema: recoverySchema, run: recoveryRequestFlow }, deps);
export const handleNewPassword = (request: Request, deps: AuthHttpDeps = {}) =>
  handle(request, { schema: newPasswordSchema, run: (client, values) => newPasswordFlow(client, values) }, deps);

/** GET del enlace de correo: intercambia el código y redirige a un destino interno de lista cerrada. */
export async function handleCallback(request: Request, deps: AuthHttpDeps = {}): Promise<Response> {
  const url = new URL(request.url);
  let destination: string = INVALID_LINK_PATH;
  try {
    const client = await (deps.getClient ?? getSessionClient)();
    destination = await callbackFlow(client, url.searchParams.get("flow"), url.searchParams.get("code"));
  } catch {
    // Sin configuración o cliente: el enlace no se puede canjear; mismo destino que un enlace inválido.
  }
  return new Response(null, {
    status: 303,
    // Ruta relativa: el navegador la resuelve contra el host que él mismo usó.
    headers: { ...PRIVATE_RESPONSE_HEADERS, Location: destination },
  });
}
