import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSessionConfig, type EnvReader } from "./config";

/**
 * Cliente **anónimo** por petición para las capacidades públicas (MVP-073/074):
 * clave pública, sin cookies ni sesión, sin persistir ni refrescar nada. La
 * capacidad es el hash de un token que valida la función SQL; este cliente no
 * otorga acceso a tablas (el rol `anon` solo ejecuta las funciones públicas).
 */
export function createAnonClient(readEnv?: EnvReader): SupabaseClient {
  const { url, publishableKey } = readSessionConfig(readEnv);
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
