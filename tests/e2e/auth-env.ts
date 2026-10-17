/**
 * Resolución de la configuración del E2E real de Auth (MVP-031). Es opt-in
 * explícito: sin `AUTH_E2E=1` la suite se omite (ejecución normal de otros
 * comandos); con `AUTH_E2E=1` cualquier dato faltante o inválido es un **error
 * de configuración**, nunca una omisión silenciosa que parezca un éxito.
 */

export const AUTH_E2E_PORT = 3217;

export class AuthE2eConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`AUTH_E2E=1 pero falta o es inválido: ${missing.join(", ")}. Usa \`npm run test:e2e:auth\`, que lo obtiene de la pila local.`);
    this.name = "AuthE2eConfigError";
  }
}

export type AuthE2eEnv = { supabaseUrl: string; publishableKey: string; mailUrl: string; port: number };

type Env = Record<string, string | undefined>;

const validUrl = (value: string | undefined) => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/** `null` = suite no solicitada (omitir); objeto = ejecutar; lanza si se solicitó y no es ejecutable. */
export function resolveAuthE2eEnv(env: Env): AuthE2eEnv | null {
  if (env.AUTH_E2E !== "1") return null;
  const missing: string[] = [];
  if (!validUrl(env.AUTH_E2E_SUPABASE_URL)) missing.push("AUTH_E2E_SUPABASE_URL");
  if (!env.AUTH_E2E_PUBLISHABLE_KEY?.trim()) missing.push("AUTH_E2E_PUBLISHABLE_KEY");
  if (!validUrl(env.AUTH_E2E_MAIL_URL)) missing.push("AUTH_E2E_MAIL_URL");
  const port = env.AUTH_E2E_PORT === undefined ? AUTH_E2E_PORT : Number(env.AUTH_E2E_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) missing.push("AUTH_E2E_PORT");
  if (missing.length > 0) throw new AuthE2eConfigError(missing);
  return {
    supabaseUrl: env.AUTH_E2E_SUPABASE_URL!,
    publishableKey: env.AUTH_E2E_PUBLISHABLE_KEY!.trim(),
    mailUrl: env.AUTH_E2E_MAIL_URL!,
    port,
  };
}
