import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { TechnicalError, TechnicalStage } from "@/lib/contracts/technical";

/**
 * Resultados y utilidades comunes de los servicios F4. Los códigos siguen
 * docs/design/data-transactions.md §4 (`NOT_AVAILABLE`, `IDEMPOTENCY_CONFLICT`,
 * `TECHNICAL_FAILURE`) más `NO_SESSION` y `INVALID_INPUT`. Un documento ajeno
 * y uno inexistente responden igual (`NOT_AVAILABLE`), sin revelar existencia.
 */

export type ServiceResult<T> = { ok: true; value: T; replayed?: boolean } | { ok: false; error: TechnicalError };

export type ServiceDeps = {
  newCorrelationId?: () => string;
};

export function failure(
  code: string,
  stage: TechnicalStage,
  retryable: boolean,
  correlationId: string,
): { ok: false; error: TechnicalError } {
  return { ok: false, error: { code, stage, retryable, correlationId } };
}

export const newId = () => randomUUID();

/** JSON canónico (claves ordenadas) para el fingerprint del comando (SH-04). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint SHA-256 del comando versionado: campos semánticos y referencias,
 * sin la clave de idempotencia, la sesión ni tiempos de transporte.
 */
export function commandFingerprint(command: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(command)).digest("hex");
}

/** Clave de idempotencia aceptada (mismo rango que `idempotency_records.key`). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
