import "server-only";

import { createHash } from "node:crypto";

/**
 * Payload HCS `galcoa.hcs.v1` (MVP-090; manifest-hcs §1–2): **solo**
 * `schemaVersion`, `reference` y `manifestHash`, en JCS (RFC 8785) → UTF-8 sin
 * BOM ni salto final. Nada de la operación, participantes, URLs ni hashes de
 * evidencias. Con tres strings ASCII validados, JCS equivale a ordenar las
 * claves por unidades UTF-16 y serializar con `JSON.stringify`.
 */

export const HCS_SCHEMA_VERSION = "galcoa.hcs.v1";
/** Un payload v1 entra en un único mensaje: nunca se divide en chunks. */
export const HCS_MAX_MESSAGE_BYTES = 1024;

const REFERENCE = /^[0-9a-f]{32}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export class HcsPayloadError extends Error {
  readonly code = "HCS_PAYLOAD_INVALID";
  readonly stage = "hcs";
  readonly retryable = false;
}

export type HcsPayload = { bytes: Uint8Array; text: string; payloadHash: string };

export function buildHcsPayload(input: { reference: string; manifestHash: string }): HcsPayload {
  if (!REFERENCE.test(input.reference)) throw new HcsPayloadError("reference inválida");
  if (!SHA256_HEX.test(input.manifestHash)) throw new HcsPayloadError("manifestHash inválido");
  const value: Record<string, string> = { manifestHash: input.manifestHash, reference: input.reference, schemaVersion: HCS_SCHEMA_VERSION };
  const keys = Object.keys(value).sort();
  const text = `{${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(value[k])}`).join(",")}}`;
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > HCS_MAX_MESSAGE_BYTES) throw new HcsPayloadError("payload excede un mensaje");
  return { bytes, text, payloadHash: createHash("sha256").update(bytes).digest("hex") };
}

/** Decodifica y valida un payload recibido; `null` si no es exactamente un v1 válido. */
export function parseHcsPayload(bytes: Uint8Array): { reference: string; manifestHash: string } | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 3 || v.schemaVersion !== HCS_SCHEMA_VERSION) return null;
  if (typeof v.reference !== "string" || typeof v.manifestHash !== "string") return null;
  try {
    // Además de los campos, los bytes tienen que ser exactamente los canónicos.
    return buildHcsPayload({ reference: v.reference, manifestHash: v.manifestHash }).text === text
      ? { reference: v.reference, manifestHash: v.manifestHash }
      : null;
  } catch {
    return null;
  }
}
