import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readSessionConfig, type EnvReader } from "./config";

/**
 * Cliente de sesión **por petición** (MVP-025; SH-07). Usa la clave pública y
 * las cookies de la petición actual: nunca se comparte entre peticiones ni se
 * guarda en un módulo. RLS sigue siendo la barrera de datos; este cliente no
 * la reemplaza.
 */

export type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Almacén de cookies de la petición (Next `cookies()`, o la respuesta en el proxy). */
export type RequestCookieStore = {
  getAll(): { name: string; value: string }[];
  /** Puede fallar en un Server Component (solo lectura): el refresco lo hace el proxy. */
  setAll(cookies: CookieToSet[], headers: Record<string, string>): void;
};

export type SessionClientDeps = {
  readEnv?: EnvReader;
  /** Los tests inyectan un doble; por defecto, `createServerClient` de `@supabase/ssr`. */
  createClient?: typeof createServerClient;
};

export function createSessionClient(cookies: RequestCookieStore, deps: SessionClientDeps = {}): SupabaseClient {
  const { url, publishableKey } = readSessionConfig(deps.readEnv);
  const create = deps.createClient ?? createServerClient;
  return create(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet, headers) => {
        try {
          cookies.setAll(toSet, headers);
        } catch {
          // Server Component de solo lectura: el proxy de sesión (MVP-030) refresca las cookies.
        }
      },
    },
  });
}

/** Cliente de sesión de la petición en curso (Server Components, Route Handlers y Server Actions). */
export async function getSessionClient(deps: SessionClientDeps = {}): Promise<SupabaseClient> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createSessionClient(
    {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
    deps,
  );
}
