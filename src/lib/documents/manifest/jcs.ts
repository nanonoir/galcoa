import "server-only";

import { createHash } from "node:crypto";

/**
 * Canonicalización JCS (RFC 8785) del perfil v1 (MVP-082; manifest-hcs §2).
 *
 * Perfil acotado: solo objetos planos, arrays, strings, `null`, booleanos y
 * enteros seguros. Importes y cantidades viajan como strings. Claves ordenadas
 * por unidades UTF-16 (no `localeCompare`), sin espacios ni salto final, UTF-8
 * sin BOM. Sin normalización Unicode: la secuencia se conserva exacta. Se
 * rechazan NaN, infinitos, fracciones, enteros inseguros, surrogates sueltos,
 * `undefined`, `Date`, `BigInt` y cualquier objeto que no sea plano.
 */

export class CanonicalizationError extends Error {
  readonly code = "CANONICAL_JSON_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value)) throw new CanonicalizationError(`Surrogate suelto en ${path}`);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new CanonicalizationError(`Número no admitido en ${path}: usar string o entero seguro`);
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!(i in value)) throw new CanonicalizationError(`Hueco en ${path}[${i}]`);
    return `[${value.map((v, i) => serialize(v, `${path}[${i}]`)).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys
      .map((k) => {
        if (LONE_SURROGATE.test(k)) throw new CanonicalizationError(`Clave inválida en ${path}`);
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined) throw new CanonicalizationError(`Valor ausente en ${path}.${k}: usar null`);
        return `${JSON.stringify(k)}:${serialize(v, `${path}.${k}`)}`;
      })
      .join(",")}}`;
  }
  throw new CanonicalizationError(`Tipo no admitido en ${path}`);
}

/** Texto canónico. */
export function canonicalize(value: unknown): string {
  return serialize(value, "$");
}

/** Bytes canónicos UTF-8 (sin BOM ni salto final). */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 de los bytes canónicos. */
export function canonicalHash(value: unknown): { bytes: Uint8Array; hash: string } {
  const bytes = canonicalBytes(value);
  return { bytes, hash: sha256Hex(bytes) };
}

/**
 * Parser JSON estricto para entradas: rechaza claves duplicadas (que
 * `JSON.parse` perdería en silencio) antes de canonicalizar.
 */
export function parseJsonStrict(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const fail = (msg: string): never => {
    throw new CanonicalizationError(`JSON inválido en ${i}: ${msg}`);
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    if (text[i] !== '"') fail("string sin cerrar");
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const val = (): unknown => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = {};
      const seen = new Set<string>();
      ws();
      if (text[i] === "}") return i++, out;
      for (;;) {
        ws();
        if (text[i] !== '"') fail("se esperaba clave");
        const key = str();
        if (seen.has(key)) fail(`clave duplicada «${key}»`);
        seen.add(key);
        ws();
        if (text[i++] !== ":") fail("se esperaba «:»");
        out[key] = val();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i++] !== "}") fail("se esperaba «}»");
        return out;
      }
    }
    if (c === "[") {
      i++;
      const out: unknown[] = [];
      ws();
      if (text[i] === "]") return i++, out;
      for (;;) {
        out.push(val());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i++] !== "]") fail("se esperaba «]»");
        return out;
      }
    }
    if (c === '"') return str();
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!m) return fail("valor inesperado");
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  const result = val();
  ws();
  if (i !== text.length) fail("contenido sobrante");
  return result;
}
