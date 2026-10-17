import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";

import { base, errorFrom, NETWORK, type ClientResult } from "./chat-client";

/**
 * Cliente de red de adjuntos (MVP-054): consume las rutas reales de evidencias
 * (`.../evidences`, `/complete`, `/extraction`). Los bytes viajan a Storage con la sesión
 * existente (`uploadReservedEvidence`), nunca por Next. Los límites son los de MVP-010 y solo
 * adelantan un rechazo claro: el servidor sigue siendo la autoridad y revalida contenido y hash.
 */

export const EVIDENCE_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const EVIDENCE_MAX_FILE_BYTES = 10 * 1_048_576;

/** Rechazo previo a la red; usa los mismos códigos estables que el servidor. */
export function precheckEvidence(file: File): TechnicalError | null {
  const code = !(EVIDENCE_ACCEPTED_TYPES as readonly string[]).includes(file.type)
    ? "EVIDENCE_UNSUPPORTED_TYPE"
    : file.size === 0
      ? "EVIDENCE_CORRUPT"
      : file.size > EVIDENCE_MAX_FILE_BYTES
        ? "EVIDENCE_TOO_LARGE"
        : null;
  return code ? { code, stage: "validacion", retryable: false, correlationId: "sin-referencia" } : null;
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const ReservedSchema = z.object({
  result: z.object({ evidence: z.object({ evidenceId: z.string().min(1) }), upload: z.unknown() }),
});
const AnyResultSchema = z.object({ result: z.unknown() });

async function post<T>(url: string, body: object, schema: z.ZodType<T>, signal?: AbortSignal): Promise<ClientResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) return { ok: false, error: await errorFrom(response), status: response.status };
    const parsed = schema.safeParse(await response.json().catch(() => null));
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: { ...NETWORK, code: "UNEXPECTED_RESPONSE" }, status: 200 };
  } catch {
    return { ok: false, error: NETWORK, status: 0 };
  }
}

/** `upload` es `null` cuando el original ya estaba aceptado (replay). La fecha del evento no se infiere. */
export async function reserveEvidence(
  documentId: string,
  file: File,
  sha256: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ClientResult<{ evidenceId: string; upload: unknown }>> {
  const result = await post(
    `${base(documentId)}/evidences`,
    { mimeType: file.type, byteLength: file.size, sha256, declaredEventDate: { kind: "unknown" }, idempotencyKey },
    ReservedSchema,
    signal,
  );
  return result.ok ? { ok: true, value: { evidenceId: result.value.result.evidence.evidenceId, upload: result.value.result.upload } } : result;
}

export async function completeEvidence(documentId: string, evidenceId: string, signal?: AbortSignal): Promise<ClientResult<null>> {
  const result = await post(`${base(documentId)}/evidences/${encodeURIComponent(evidenceId)}/complete`, {}, AnyResultSchema, signal);
  return result.ok ? { ok: true, value: null } : result;
}

export async function extractEvidence(documentId: string, evidenceId: string, signal?: AbortSignal): Promise<ClientResult<null>> {
  const result = await post(`${base(documentId)}/evidences/${encodeURIComponent(evidenceId)}/extraction`, {}, AnyResultSchema, signal);
  return result.ok ? { ok: true, value: null } : result;
}

