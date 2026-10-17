import "server-only";

import { createPrivilegedClient, type PrivilegedClientDeps } from "@/lib/supabase/privileged";

import type { ArtifactStorage } from "./publish";

const BUCKET = "versions-private";

/**
 * Storage privado de versiones (MVP-083). Usa el cliente privilegiado porque los objetos reservados aún no
 * son legibles por el propietario (la lectura RLS exige `version_artifacts`); se crea solo cuando hace falta,
 * después de que la RPC del ejecutor validó propiedad, fencing y reserva. `upsert: false` impide sobrescribir.
 */
export function createArtifactStorage(context: { verifiedUserId: string; privilegedDeps?: PrivilegedClientDeps }): ArtifactStorage {
  const client = () => createPrivilegedClient({ verifiedUserId: context.verifiedUserId, operation: "finalization.store_artifact" }, context.privilegedDeps);
  const status = (error: unknown) => (typeof error === "object" && error !== null && "statusCode" in error ? String(error.statusCode) : "");
  return {
    async upload(path, bytes, contentType) {
      const { error } = await client().storage.from(BUCKET).upload(path, bytes, { upsert: false, contentType });
      if (!error) return "created";
      if (status(error) === "409") return "exists";
      throw new Error("Subida de artefacto no disponible");
    },
    async download(path) {
      const { data, error } = await client().storage.from(BUCKET).download(path);
      if (error) {
        if (status(error) === "404") return null;
        throw new Error("Lectura de artefacto no disponible");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
