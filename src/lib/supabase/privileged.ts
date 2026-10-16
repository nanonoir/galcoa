import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readPrivilegedConfig, type EnvReader } from "./config";

/**
 * Cliente privilegiado de uso acotado (MVP-025; SH-07, REQ-17). Ignora RLS,
 * así que **solo** se crea después de que el servicio verificó al usuario y su
 * propiedad o capacidad sobre la operación, y solo para lo que lo exige
 * (Storage y funciones restringidas). No persiste sesión ni refresca tokens,
 * no se guarda en un módulo y nunca sale del servidor.
 */

/** Constancia de que la operación ya se autorizó; sin ella no hay cliente. */
export type AuthorizedOperation = {
  /** Usuario verificado por el helper de sesión (MVP-030). */
  verifiedUserId: string;
  /** Operación concreta, para registro sin datos privados (p. ej. `evidence.sign_upload`). */
  operation: string;
};

export class PrivilegedAccessError extends Error {
  readonly code = "PRIVILEGED_NOT_AUTHORIZED";
  readonly stage = "autenticacion";
  readonly retryable = false;
  constructor() {
    super("Operación privilegiada sin autorización previa.");
    this.name = "PrivilegedAccessError";
  }
}

export type PrivilegedClientDeps = {
  readEnv?: EnvReader;
  createClient?: typeof createClient;
};

const OPERATION_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function createPrivilegedClient(authorized: AuthorizedOperation, deps: PrivilegedClientDeps = {}): SupabaseClient {
  if (!authorized?.verifiedUserId?.trim() || !OPERATION_PATTERN.test(authorized.operation ?? "")) {
    throw new PrivilegedAccessError();
  }
  const { url, secretKey } = readPrivilegedConfig(deps.readEnv);
  const create = deps.createClient ?? createClient;
  return create(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
