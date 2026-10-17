import { createHash, randomUUID } from "node:crypto";

import type {
  EvidenceStorage,
  EvidenceStore,
  StoredEvidence,
  StoredExtraction,
} from "@/lib/documents/evidence/ports";

/**
 * Dobles en memoria de los puertos de evidencias, exclusivos de tests. Imitan
 * lo que harán la RPC y el bucket privado: topes acumulados bajo lock (JS
 * ejecuta cada llamada sin intercalar), idempotencia por clave, original
 * aceptado inmutable, extracciones de solo agregar y objetos sin
 * sobrescritura. No acreditan RLS, Storage ni transacciones reales (SH-09).
 */

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function createEvidenceDoubles(options: { documents: Record<string, string> }) {
  /** documentId → ownerId */
  const owners = new Map(Object.entries(options.documents));
  const evidences = new Map<string, StoredEvidence>();
  const extractions: StoredExtraction[] = [];
  const idempotency = new Map<string, { fingerprint: string; evidenceId: string }>();
  const objects = new Map<string, Uint8Array>();
  const audit: { type: string; evidenceId: string; correlationId: string }[] = [];
  const removed: string[] = [];
  const signedUploads: { location: string; maxBytes: number; expiresAt: string }[] = [];
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 16, 15, 0, tick++)).toISOString();
  const fail = { reserve: false, accept: false, download: false, append: false, signedUpload: false };

  const owns = (ownerId: string, documentId: string) => owners.get(documentId) === ownerId;

  const store: EvidenceStore = {
    async reserveEvidence(input) {
      if (fail.reserve) throw new Error("base caída");
      if (!owns(input.ownerId, input.documentId)) return { status: "not_available" };
      const key = `${input.ownerId}|${input.idempotency.key}`;
      const prior = idempotency.get(key);
      if (prior) {
        if (prior.fingerprint !== input.idempotency.fingerprint) return { status: "idempotency_conflict" };
        const e = evidences.get(prior.evidenceId);
        if (!e || e.cleanupClaimedAt || (e.uploadState === "reserved" && Date.parse(e.uploadExpiresAt) <= Date.now())) return {status:"not_available"};
        return {status:"replayed",evidence:e};
      }
      if ((await store.listDiscards(input.ownerId)).length) return {status:"discard_pending"};
      const current = [...evidences.values()].filter((e) => e.documentId === input.documentId);
      if (current.length + 1 > input.limits.maxFiles) return { status: "limit_exceeded", limit: "files" };
      const total = current.reduce((sum, e) => sum + e.byteLength, 0) + input.byteLength;
      if (total > input.limits.maxTotalBytes) return { status: "limit_exceeded", limit: "total_bytes" };
      const evidence: StoredEvidence = {
        evidenceId: randomUUID(),
        documentId: input.documentId,
        kind: input.kind,
        mimeType: input.mimeType,
        byteLength: input.byteLength,
        sha256: input.sha256,
        privateLocation: input.privateLocation,
        uploadState: "reserved",
        declaredEventDate: input.declaredEventDate,
        uploadedAt: now(),
        acceptedAt: null,
        uploadExpiresAt: new Date(Date.now() + 120_000).toISOString(),
        cleanupClaimedAt: null,
      };
      evidences.set(evidence.evidenceId, evidence);
      idempotency.set(key, { fingerprint: input.idempotency.fingerprint, evidenceId: evidence.evidenceId });
      return { status: "reserved", evidence };
    },
    async getEvidence(ownerId, documentId, evidenceId) {
      const e = evidences.get(evidenceId);
      return e && e.documentId === documentId && owns(ownerId, documentId) ? e : null;
    },
    async listEvidences(ownerId, documentId) {
      return owns(ownerId, documentId) ? [...evidences.values()].filter((e) => e.documentId === documentId) : null;
    },
    async acceptEvidence({ ownerId, evidenceId, audit: ctx }) {
      if (fail.accept) throw new Error("base caída");
      const e = evidences.get(evidenceId);
      if (!e || !owns(ownerId, e.documentId) || e.uploadState !== "reserved") return null;
      if (e.cleanupClaimedAt || Date.parse(e.uploadExpiresAt) <= Date.now()) return null;
      const accepted: StoredEvidence = { ...e, uploadState: "accepted", acceptedAt: now() };
      evidences.set(evidenceId, accepted);
      audit.push({ type: "evidence.accepted", evidenceId, correlationId: ctx.correlationId });
      return accepted;
    },
    async discardReservation({ ownerId, evidenceId }) {
      const e = evidences.get(evidenceId);
      if (!e || !owns(ownerId, e.documentId)) return;
      if (e.uploadState === "accepted") throw new Error("un original aceptado no se borra");
      if (e.cleanupClaimedAt) evidences.delete(evidenceId);
    },
    async listDiscards(ownerId) {
      return [...evidences.values()].filter((e) => owns(ownerId, e.documentId) && e.uploadState === "reserved" &&
        (e.cleanupClaimedAt || Date.parse(e.uploadExpiresAt) <= Date.now())).slice(0, 3);
    },
    async claimDiscard(ownerId, id, rejected) {
      const e = evidences.get(id);
      if (!e || !owns(ownerId, e.documentId) || e.uploadState !== "reserved") return null;
      if (!e.cleanupClaimedAt && !rejected && Date.parse(e.uploadExpiresAt) > Date.now()) return null;
      const claimed = { ...e, cleanupClaimedAt: e.cleanupClaimedAt ?? now() };
      evidences.set(id, claimed);
      return claimed;
    },
    async appendExtraction(input) {
      if (fail.append) throw new Error("base caída");
      const { ownerId, audit: ctx, ...rest } = input;
      void ownerId;
      const saved: StoredExtraction = { ...rest, extractionId: randomUUID(), extractedAt: now() };
      extractions.push(saved);
      audit.push({ type: "extraction.recorded", evidenceId: input.evidenceId, correlationId: ctx.correlationId });
      return saved;
    },
    async listExtractions(ownerId, documentId) {
      return owns(ownerId, documentId) ? extractions.filter((x) => x.documentId === documentId) : null;
    },
  };

  const storage: EvidenceStorage = {
    async authorizeDirectUpload(location, opts) {
      if (fail.signedUpload) throw new Error("storage caído");
      signedUploads.push({ location, maxBytes: opts.maxBytes, expiresAt: opts.expiresAt });
      return { transport: "authenticated", bucket: "evidences-private", objectPath: location, contentType: opts.contentType, maxBytes: opts.maxBytes, expiresAt: opts.expiresAt };
    },
    async download(location) {
      if (fail.download) throw new Error("storage caído");
      return objects.get(location) ?? null;
    },
    async remove(location) {
      const e = [...evidences.values()].find((e) => e.privateLocation === location);
      if (!e || e.uploadState === "accepted" || !e.cleanupClaimedAt) throw new Error("Descarte no reclamado");
      removed.push(location);
      objects.delete(location);
    },
    async createSignedRead(location, expiresInSeconds) {
      return { url: `https://storage.invalid/read/${location}?ttl=${expiresInSeconds}`, expiresAt: now() };
    },
  };

  /** Simula la subida directa del cliente (sin sobrescribir un objeto existente). */
  const upload = (location: string, bytes: Uint8Array) => {
    if (objects.has(location)) throw new Error("sin sobrescritura");
    objects.set(location, bytes);
  };

  return { store, storage, upload, objects, evidences, extractions, audit, removed, signedUploads, fail };
}

// Archivos mínimos válidos, ficticios.

export function pdfBytes(pages: number, options: { encrypted?: boolean; eof?: boolean } = {}): Uint8Array {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pageObjs = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj<</Type /Page /Parent 2 0 R>>endobj\n`).join("");
  const text =
    `%PDF-1.4\n1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n2 0 obj<</Type /Pages /Kids [${kids}] /Count ${pages}>>endobj\n` +
    pageObjs +
    `trailer<</Root 1 0 R${options.encrypted ? " /Encrypt 99 0 R" : ""}>>\n` +
    (options.eof === false ? "" : "%%EOF\n");
  return new Uint8Array(Buffer.from(text, "latin1"));
}

export function pngBytes(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(45);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b.writeUInt8(8, 24);
  b.writeUInt8(2, 25);
  b.write("IEND", 37, "latin1");
  return new Uint8Array(b);
}

export function jpegBytes(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}
