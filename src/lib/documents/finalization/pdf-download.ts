import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";

/**
 * Descarga autenticada del PDF final de una versión publicada (INV-05, INV-18). Sirve los bytes ya
 * almacenados en `versions-private`: nunca regenera. Con la sesión del propietario, la RLS de
 * `document_versions`, `version_artifacts` y del bucket decide el acceso; un documento ajeno, una
 * versión inexistente y un artefacto ausente responden igual (404). Antes de servir se comprueba que
 * los bytes coinciden con el hash y la longitud registrados al publicar: ante discrepancia no se
 * entrega nada.
 */

const BUCKET = "versions-private";

export interface PdfDownloadContext {
  session: SessionCheck;
  /** Cliente con la sesión del usuario (RLS vigente); jamás el privilegiado. */
  client: Pick<SupabaseClient, "from" | "storage">;
}
export interface PdfDownloadDeps {
  getContext(): Promise<PdfDownloadContext>;
}

const VersionRow = z.object({ id: z.uuid(), public_reference: z.string().min(1) });
const ArtifactRow = z.object({
  object_path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byte_length: z.coerce.number().int().positive(),
});

const BINARY_HEADERS = {
  ...PRIVATE_RESPONSE_HEADERS,
  "X-Content-Type-Options": "nosniff",
} as const;

function failure(status: number, code: string, extra: Record<string, string> = {}) {
  return Response.json({ error: { code } }, { status, headers: { ...BINARY_HEADERS, ...extra } });
}
const notAvailable = () => failure(404, "NOT_AVAILABLE");
const unavailable = () => failure(503, "TECHNICAL_FAILURE");

export function createFinalPdfDownloadHandler(deps: PdfDownloadDeps) {
  return async (request: Request, documentId: string, versionNumber: string): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") return failure(405, "METHOD_NOT_ALLOWED", { Allow: "GET, HEAD" });
    const head = request.method === "HEAD";
    try {
      const { session, client } = await deps.getContext();
      if (session.status === "anonymous") return failure(401, "NO_SESSION");
      if (session.status !== "authenticated") return failure(503, "AUTH_UNAVAILABLE");
      if (!z.uuid().safeParse(documentId).success || !/^[1-9]\d{0,8}$/.test(versionNumber)) return notAvailable();

      const versionRes = await client
        .from("document_versions")
        .select("id, public_reference")
        .eq("document_id", documentId)
        .eq("version_number", Number(versionNumber))
        .maybeSingle();
      if (versionRes.error) return unavailable();
      if (!versionRes.data) return notAvailable();
      const version = VersionRow.parse(versionRes.data);

      const artifactRes = await client
        .from("version_artifacts")
        .select("object_path, sha256, byte_length")
        .eq("version_id", version.id)
        .eq("kind", "pdf")
        .maybeSingle();
      if (artifactRes.error) return unavailable();
      if (!artifactRes.data) return notAvailable();
      const artifact = ArtifactRow.parse(artifactRes.data);

      const download = await client.storage.from(BUCKET).download(artifact.object_path);
      if (download.error) {
        const code = "statusCode" in download.error ? String(download.error.statusCode) : "";
        return code === "404" ? notAvailable() : unavailable();
      }
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      if (bytes.byteLength !== artifact.byte_length || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
        return failure(500, "ARTIFACT_INTEGRITY");
      }

      const safeReference = version.public_reference.replace(/[^A-Za-z0-9_-]/g, "");
      const filename = `galcoa-${safeReference ? `${safeReference}-` : ""}v${versionNumber}.pdf`;
      // HEAD: mismas comprobaciones y cabeceras que GET, sin cuerpo.
      return new Response(head ? null : bytes, {
        status: 200,
        headers: {
          ...BINARY_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      return unavailable();
    }
  };
}
