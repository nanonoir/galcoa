import "server-only";

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { z } from "zod";

import type { AuthFieldError } from "@/lib/contracts/auth-forms";

import { verifySession } from "./auth";

/**
 * Flujos de Auth reales: alta, acceso, cierre de sesión, recuperación y nueva
 * contraseña (MVP-031; REQ-01). Reciben el cliente de sesión por petición y
 * devuelven un resultado **neutral**: ninguna respuesta revela si una cuenta
 * existe, y un fallo del proveedor nunca se presenta como éxito. No registran
 * correos, contraseñas ni tokens.
 */

type AuthClient = Pick<SupabaseClient, "auth">;

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignora lo que excede 72 bytes; se rechaza en vez de truncar en silencio. */
export const PASSWORD_MAX_BYTES = 72;

/** Destinos internos tras el callback (lista cerrada: nunca se acepta una URL del cliente). */
export const AUTH_PATHS = {
  login: "/acceso",
  register: "/registro",
  recovery: "/recuperar",
  newPassword: "/nueva-contrasena",
  afterLogin: "/dashboard",
} as const;

export const CALLBACK_PATH = "/api/auth/callback";
export const INVALID_LINK_PATH = `${AUTH_PATHS.login}?aviso=enlace-invalido`;

const CALLBACK_FLOWS = {
  signup: { destination: `${AUTH_PATHS.login}?aviso=confirmado`, keepSession: false },
  recovery: { destination: AUTH_PATHS.newPassword, keepSession: true },
} as const;

export type CallbackFlow = keyof typeof CALLBACK_FLOWS;

export function callbackUrl(origin: string, flow: CallbackFlow): string {
  return `${origin}${CALLBACK_PATH}?flow=${flow}`;
}

export const MESSAGES = {
  registerSent:
    "Si el correo puede registrarse, te enviamos un mensaje para confirmar la cuenta. Revisa tu bandeja.",
  recoverySent:
    "Si el correo corresponde a una cuenta, te enviamos un mensaje con el enlace para elegir una nueva contraseña.",
  loginOk: "Ingreso correcto. Redirigiendo…",
  passwordUpdated: "Contraseña actualizada. Redirigiendo al acceso…",
  credentials: "Correo o contraseña incorrectos.",
  invalidData: "Revisa los datos e intenta nuevamente.",
  rateLimited: "Se alcanzó el límite de envíos de correo. Espera un momento e intenta nuevamente.",
  unavailable: "El servicio de acceso no está disponible por ahora. Intenta nuevamente en unos minutos.",
  registrationClosed: "El registro no está disponible por ahora.",
  noRecoverySession: "El enlace no es válido o venció. Solicita uno nuevo.",
  samePassword: "Elige una contraseña distinta de la anterior.",
} as const;

export type FlowResult =
  | { ok: true; message: string; redirectTo?: string }
  | {
      ok: false;
      kind: "invalid" | "credentials" | "no_session" | "rate_limited" | "unavailable";
      message: string | null;
      fieldErrors: AuthFieldError[];
    };

const fail = (
  kind: Extract<FlowResult, { ok: false }>["kind"],
  message: string | null,
  fieldErrors: AuthFieldError[] = [],
): FlowResult => ({ ok: false, kind, message, fieldErrors });

// ---------------------------------------------------------------- validación

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Ingresa un correo válido.")
  .pipe(z.email("Ingresa un correo válido."));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .refine((v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES, "La contraseña es demasiado larga.");

const confirmation = z.string().min(1, "Confirma la contraseña.");

export const loginSchema = z.object({ email, password: z.string().min(1, "Ingresa tu contraseña.") });
export const recoverySchema = z.object({ email });

export const registerSchema = z
  .object({ email, password: newPassword, confirmPassword: confirmation })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

export const newPasswordSchema = z
  .object({ password: newPassword, confirmPassword: confirmation })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

const FIELDS = new Set(["email", "password", "confirmPassword"]);

/** Un error por campo (el primero); los mensajes ya vienen redactados en el esquema. */
export function toFieldErrors(error: z.ZodError): AuthFieldError[] {
  const seen = new Set<string>();
  const out: AuthFieldError[] = [];
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!FIELDS.has(field) || seen.has(field)) continue;
    seen.add(field);
    out.push({ field: field as AuthFieldError["field"], message: issue.message });
  }
  return out;
}

// ------------------------------------------------------- errores del proveedor

type ProviderFailure = "rate_limited" | "unavailable" | "weak_password" | "same_password" | "email_invalid" | "closed" | "rejected";

const RATE_LIMIT_CODES = new Set(["over_email_send_rate_limit", "over_request_rate_limit", "over_sms_send_rate_limit"]);

/** Clasifica un error de Supabase sin exponer su texto. */
export function classifyProviderError(error: unknown): ProviderFailure {
  if (isAuthRetryableFetchError(error)) return "unavailable";
  if (isAuthWeakPasswordError(error)) return "weak_password";
  if (!isAuthApiError(error)) return "unavailable";
  const code = error.code ?? "";
  if (error.status === 429 || RATE_LIMIT_CODES.has(code)) return "rate_limited";
  if (error.status >= 500) return "unavailable";
  if (code === "weak_password") return "weak_password";
  if (code === "same_password") return "same_password";
  if (code === "email_address_invalid") return "email_invalid";
  if (code === "signup_disabled" || code === "email_provider_disabled") return "closed";
  return "rejected";
}

const passwordRejected = (message: string) => fail("invalid", null, [{ field: "password", message }]);

// --------------------------------------------------------------------- flujos

export async function registerFlow(
  client: AuthClient,
  values: z.infer<typeof registerSchema>,
  ctx: { origin: string },
): Promise<FlowResult> {
  try {
    const { error } = await client.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: callbackUrl(ctx.origin, "signup") },
    });
    if (!error) return { ok: true, message: MESSAGES.registerSent };
    switch (classifyProviderError(error)) {
      case "weak_password":
        return passwordRejected("La contraseña es demasiado débil. Elige una más larga o distinta.");
      case "email_invalid":
        return fail("invalid", null, [{ field: "email", message: "Ingresa un correo válido." }]);
      case "rate_limited":
        return fail("rate_limited", MESSAGES.rateLimited);
      case "closed":
        return fail("unavailable", MESSAGES.registrationClosed);
      case "unavailable":
        return fail("unavailable", MESSAGES.unavailable);
      default:
        // Cuenta ya existente u otro rechazo 4xx: misma respuesta que un alta nueva (sin enumeración).
        return { ok: true, message: MESSAGES.registerSent };
    }
  } catch {
    return fail("unavailable", MESSAGES.unavailable);
  }
}

export async function loginFlow(client: AuthClient, values: z.infer<typeof loginSchema>): Promise<FlowResult> {
  try {
    const { error } = await client.auth.signInWithPassword(values);
    if (!error) return { ok: true, message: MESSAGES.loginOk, redirectTo: AUTH_PATHS.afterLogin };
    switch (classifyProviderError(error)) {
      case "rate_limited":
        return fail("rate_limited", MESSAGES.rateLimited);
      case "unavailable":
        return fail("unavailable", MESSAGES.unavailable);
      default:
        // Credenciales erróneas, correo sin confirmar o cuenta inexistente: un único mensaje.
        return fail("credentials", MESSAGES.credentials);
    }
  } catch {
    return fail("unavailable", MESSAGES.unavailable);
  }
}

export async function logoutFlow(client: AuthClient): Promise<FlowResult> {
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    // Sin sesión o token ya inválido: el resultado buscado (sin sesión) ya se cumple.
    if (error && !isAuthSessionMissingError(error) && classifyProviderError(error) === "unavailable") return fail("unavailable", MESSAGES.unavailable);
    return { ok: true, message: "Sesión cerrada.", redirectTo: AUTH_PATHS.login };
  } catch {
    return fail("unavailable", MESSAGES.unavailable);
  }
}

export async function recoveryRequestFlow(
  client: AuthClient,
  values: z.infer<typeof recoverySchema>,
  ctx: { origin: string },
): Promise<FlowResult> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(values.email, {
      redirectTo: callbackUrl(ctx.origin, "recovery"),
    });
    if (!error) return { ok: true, message: MESSAGES.recoverySent };
    switch (classifyProviderError(error)) {
      case "rate_limited":
        return fail("rate_limited", MESSAGES.rateLimited);
      case "unavailable":
        return fail("unavailable", MESSAGES.unavailable);
      default:
        return { ok: true, message: MESSAGES.recoverySent };
    }
  } catch {
    return fail("unavailable", MESSAGES.unavailable);
  }
}

export async function newPasswordFlow(
  client: AuthClient,
  values: z.infer<typeof newPasswordSchema>,
): Promise<FlowResult> {
  try {
    const session = await verifySession(client);
    if (session.status === "unavailable") return fail("unavailable", MESSAGES.unavailable);
    if (session.status === "anonymous") return fail("no_session", MESSAGES.noRecoverySession);

    const { error } = await client.auth.updateUser({ password: values.password });
    if (error) {
      switch (classifyProviderError(error)) {
        case "weak_password":
          return passwordRejected("La contraseña es demasiado débil. Elige una más larga o distinta.");
        case "same_password":
          return passwordRejected(MESSAGES.samePassword);
        case "rate_limited":
          return fail("rate_limited", MESSAGES.rateLimited);
        case "unavailable":
          return fail("unavailable", MESSAGES.unavailable);
        default:
          return fail("no_session", MESSAGES.noRecoverySession);
      }
    }
    // El flujo termina en el acceso: se cierra la sesión de recuperación y se inicia sesión de nuevo.
    await client.auth.signOut({ scope: "local" });
    return {
      ok: true,
      message: MESSAGES.passwordUpdated,
      redirectTo: `${AUTH_PATHS.login}?aviso=contrasena-actualizada`,
    };
  } catch {
    return fail("unavailable", MESSAGES.unavailable);
  }
}

/**
 * Callback de confirmación/recuperación (PKCE). Devuelve siempre un destino
 * interno de lista cerrada; el `code` solo se usa aquí y nunca se registra.
 */
export async function callbackFlow(client: AuthClient, flow: string | null, code: string | null): Promise<string> {
  const failure = INVALID_LINK_PATH;
  const target = flow !== null && Object.hasOwn(CALLBACK_FLOWS, flow) ? CALLBACK_FLOWS[flow as CallbackFlow] : null;
  if (!target || !code) return failure;
  try {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return failure;
    if (!target.keepSession) await client.auth.signOut({ scope: "local" });
    return target.destination;
  } catch {
    return failure;
  }
}
