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
import { SupabaseConfigError, type EnvReader } from "./config";
import { getSessionClient } from "./session";

/**
 * Capa HTTP delgada de los Route Handlers de Auth (MVP-031). Solo POST con JSON
 * y mismo origen (defensa CSRF además de `SameSite` de las cookies), respuestas
 * sin caché ni `Referer`, y cuerpo `{ state, redirectTo? }` que el container
 * traduce al estado de la presentación. Nada de esto se ejecuta al importar.
 */

type AuthClient = Pick<SupabaseClient, "auth">;

export type AuthHttpDeps = {
  getClient?: () => Promise<AuthClient>;
  /** Los tests inyectan la lista; por defecto se lee `NEXT_PUBLIC_APP_URL`. */
  trustedOrigins?: string[];
  readEnv?: EnvReader;
};

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

/** Variable pública existente con el/los origen(es) canónico(s) de la app (`.env.example`). */
export const APP_URL_ENV = "NEXT_PUBLIC_APP_URL";

/** Falta o es inválida la configuración del origen canónico: impedimento técnico, no «origen hostil». */
export class TrustedOriginConfigError extends Error {
  readonly code = "AUTH_ORIGIN_CONFIG_MISSING";
  constructor() {
    super("Falta el origen canónico de la aplicación.");
    this.name = "TrustedOriginConfigError";
  }
}

/**
 * Lista cerrada de orígenes confiables (esquema + host + puerto) desde
 * `NEXT_PUBLIC_APP_URL` (uno, o varios separados por coma). Se lee al usar, no al
 * importar. Nunca se derivan de cabeceras de la petición.
 */
export function readTrustedOrigins(readEnv: EnvReader = (name) => process.env[name]): string[] {
  const origins = (readEnv(APP_URL_ENV) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? [url.origin] : [];
      } catch {
        return [];
      }
    });
  if (origins.length === 0) throw new TrustedOriginConfigError();
  return origins;
}

/**
 * Origen confiable de la petición: el `Origin` debe coincidir **exactamente**
 * (esquema y host) con la lista canónica. No se consulta `Host`, `X-Forwarded-*`
 * ni `request.url`: son manipulables o los normaliza el servidor. Una petición sin
 * `Origin` (no navegador) se rechaza. Devuelve ese origen o `null`.
 */
export function trustedOrigin(request: Request, trusted: readonly string[]): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const source = new URL(origin).origin;
    return trusted.includes(source) ? source : null;
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
  let trusted: string[];
  try {
    trusted = deps.trustedOrigins ?? readTrustedOrigins(deps.readEnv);
  } catch (error) {
    if (error instanceof TrustedOriginConfigError) return respond(503, errorState(MESSAGES.unavailable));
    throw error;
  }
  const origin = trustedOrigin(request, trusted);
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
