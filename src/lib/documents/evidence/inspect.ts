import "server-only";

/**
 * Inspección determinista de los bytes de una evidencia (MVP-042; sources-and-ai
 * §7.1). Se valida por **contenido**, no por extensión ni por el tipo que declara
 * el cliente. Sin dependencias nuevas: firmas de PDF, PNG y JPEG, árbol de
 * páginas del PDF y dimensiones de la imagen. Ante la duda se rechaza con un
 * código técnico estable; nunca se trunca ni se «arregla» el archivo.
 */

const MiB = 1_048_576;

/** Límites aprobados en MVP-010 (§7.1). 1 MiB = 1 048 576 bytes (convención local documentada). */
export const EVIDENCE_LIMITS = {
  maxFileBytes: 10 * MiB,
  maxFilesPerDocument: 3,
  maxTotalBytesPerDocument: 20 * MiB,
  maxPdfPages: 10,
  maxImagePixels: 20_000_000,
} as const;

export const EVIDENCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];

export type InspectionResult =
  | { ok: true; mimeType: EvidenceMimeType; kind: "pdf" | "imagen"; pages: number | null; pixels: number | null }
  | {
      ok: false;
      code:
        | "EVIDENCE_TYPE_MISMATCH"
        | "EVIDENCE_UNSUPPORTED_TYPE"
        | "EVIDENCE_CORRUPT"
        | "EVIDENCE_PDF_ENCRYPTED"
        | "EVIDENCE_PDF_TOO_MANY_PAGES"
        | "EVIDENCE_IMAGE_TOO_LARGE"
        | "EVIDENCE_TOO_LARGE";
    };

export function detectMimeType(bytes: Uint8Array): EvidenceMimeType | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/** Texto latin1 del PDF: cada byte es un carácter, así los offsets coinciden. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

function inspectPdf(bytes: Uint8Array): InspectionResult {
  const text = latin1(bytes);
  if (!text.slice(-1024).includes("%%EOF")) return { ok: false, code: "EVIDENCE_CORRUPT" };
  if (/\/Encrypt\b/.test(text)) return { ok: false, code: "EVIDENCE_PDF_ENCRYPTED" };
  // Hojas del árbol (/Type /Page) y totales declarados en los nodos /Pages (/Count).
  const leaves = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) =>
    Number(m[1] ?? m[2]),
  );
  const pages = Math.max(leaves, ...counts, 0);
  // Sin árbol de páginas visible (p. ej. todo en flujos comprimidos) no se puede contar: se rechaza.
  if (pages === 0) return { ok: false, code: "EVIDENCE_CORRUPT" };
  if (pages > EVIDENCE_LIMITS.maxPdfPages) return { ok: false, code: "EVIDENCE_PDF_TOO_MANY_PAGES" };
  return { ok: true, mimeType: "application/pdf", kind: "pdf", pages, pixels: null };
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 33) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (latin1(bytes.subarray(12, 16)) !== "IHDR") return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < bytes.byteLength) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    // SOF0–SOF15, salvo DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (marker === 0xda || marker === 0xd9) return null; // datos de imagen antes de un SOF
    i += 2 + length;
  }
  return null;
}

/** Inspecciona bytes subidos frente al tipo que se declaró al reservar. */
export function inspectEvidence(bytes: Uint8Array, declared: EvidenceMimeType): InspectionResult {
  if (bytes.byteLength > EVIDENCE_LIMITS.maxFileBytes) return { ok: false, code: "EVIDENCE_TOO_LARGE" };
  const detected = detectMimeType(bytes);
  if (!detected) return { ok: false, code: "EVIDENCE_UNSUPPORTED_TYPE" };
  if (detected !== declared) return { ok: false, code: "EVIDENCE_TYPE_MISMATCH" };
  if (detected === "application/pdf") return inspectPdf(bytes);

  const size = detected === "image/png" ? pngSize(bytes) : jpegSize(bytes);
  if (!size || size.width === 0 || size.height === 0) return { ok: false, code: "EVIDENCE_CORRUPT" };
  const pixels = size.width * size.height;
  if (pixels > EVIDENCE_LIMITS.maxImagePixels) return { ok: false, code: "EVIDENCE_IMAGE_TOO_LARGE" };
  return { ok: true, mimeType: detected, kind: "imagen", pages: null, pixels };
}
