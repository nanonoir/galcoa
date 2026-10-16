import "server-only";

/**
 * Configuración de Supabase (MVP-025; PRD §13, REQ-17). Se lee al **usar** un
 * cliente, nunca al importar ni durante `build`. Si falta algo, se lanza un
 * error técnico estable con código y etapa, sin valores ni nombres de claves
 * privilegiadas en el mensaje.
 */

export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_PUBLISHABLE_KEY_ENV = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
/** Clave privilegiada: solo servidor, nunca con prefijo `NEXT_PUBLIC_`. */
export const SUPABASE_SECRET_KEY_ENV = "SUPABASE_SECRET_KEY";

export type EnvReader = (name: string) => string | undefined;
const readProcessEnv: EnvReader = (name) => process.env[name];

export class SupabaseConfigError extends Error {
  readonly code = "SUPABASE_CONFIG_MISSING";
  readonly stage = "persistencia";
  readonly retryable = false;
  constructor(readonly scope: "session" | "privileged") {
    super(`Falta configuración de Supabase (${scope === "session" ? "sesión" : "privilegiada"}).`);
    this.name = "SupabaseConfigError";
  }
}

const read = (readEnv: EnvReader, name: string) => readEnv(name)?.trim() || undefined;

function validUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** URL y clave pública para el cliente de sesión. */
export function readSessionConfig(readEnv: EnvReader = readProcessEnv): { url: string; publishableKey: string } {
  const url = validUrl(read(readEnv, SUPABASE_URL_ENV));
  const publishableKey = read(readEnv, SUPABASE_PUBLISHABLE_KEY_ENV);
  if (!url || !publishableKey) throw new SupabaseConfigError("session");
  return { url, publishableKey };
}

/** URL y clave privilegiada; solo la usa `privileged.ts`. */
export function readPrivilegedConfig(readEnv: EnvReader = readProcessEnv): { url: string; secretKey: string } {
  const url = validUrl(read(readEnv, SUPABASE_URL_ENV));
  const secretKey = read(readEnv, SUPABASE_SECRET_KEY_ENV);
  if (!url || !secretKey) throw new SupabaseConfigError("privileged");
  return { url, secretKey };
}
