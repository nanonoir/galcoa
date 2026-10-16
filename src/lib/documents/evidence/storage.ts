import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedClient, type PrivilegedClientDeps } from "@/lib/supabase/privileged";
import type { EvidenceStorage, EvidenceStore } from "./ports";
import { DirectUploadPermitSchema } from "@/features/auth/contracts/evidence-upload";

const BUCKET = "evidences-private";

/** Sesión real para lecturas; privilegio creado solo al limpiar una reserva rechazada. */
export function createEvidenceStorage(context: {
  verifiedUserId: string; session: SupabaseClient; store: EvidenceStore;
  privilegedDeps?: PrivilegedClientDeps;
}): EvidenceStorage {
  async function owned(path: string) {
    const [doc] = path.split("/");
    const rows = await context.store.listEvidences(context.verifiedUserId, doc);
    const row = rows?.find((e) => e.privateLocation === path);
    if (!row) throw new Error("Objeto no disponible");
    return row;
  }
  return {
    async authorizeDirectUpload(path, options) {
      const row = await owned(path);
      if (row.uploadState !== "reserved" || row.uploadExpiresAt !== options.expiresAt ||
          row.mimeType !== options.contentType || row.byteLength !== options.maxBytes) throw new Error("Reserva no disponible");
      return DirectUploadPermitSchema.parse({ transport: "authenticated", bucket: BUCKET,
        objectPath: path, contentType: row.mimeType, maxBytes: row.byteLength, expiresAt: row.uploadExpiresAt });
    },
    async download(path) {
      await owned(path);
      const { data, error } = await context.session.storage.from(BUCKET).download(path);
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "404") return null;
        throw new Error("Lectura de original no disponible");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(path) {
      const row = await owned(path);
      if (row.uploadState !== "reserved") throw new Error("Original inmutable");
      const client = createPrivilegedClient({ verifiedUserId: context.verifiedUserId, operation: "evidence.cleanup_rejected" }, context.privilegedDeps);
      const { error } = await client.storage.from(BUCKET).remove([path]);
      if (error) throw new Error("Limpieza de reserva no disponible");
    },
    async createSignedRead(path, seconds) {
      const row = await owned(path);
      if (row.uploadState !== "accepted" || seconds !== 60) throw new Error("Original no disponible");
      const { data, error } = await context.session.storage.from(BUCKET).createSignedUrl(path, seconds);
      if (error) throw new Error("Lectura de original no disponible");
      return { url: data.signedUrl, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
    },
  };
}
