import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PRIVATE_RESPONSE_HEADERS, verifySession } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

const headers = { ...PRIVATE_RESPONSE_HEADERS, "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lectura de la versión publicada: el mismo cliente de sesión aplica RLS a tablas y Storage. */
export function createPublishedDownloadHandler(clientForRequest: () => Promise<SupabaseClient> = getSessionClient) {
  return async (documentId: string, number: string, download: boolean): Promise<Response> => {
    const unavailable = (status = 404) => Response.json({ error: { code: status === 401 ? "NO_SESSION" : "NOT_AVAILABLE" } }, { status, headers });
    try {
      const client = await clientForRequest();
      const session = await verifySession(client);
      if (session.status === "anonymous") return unavailable(401);
      if (session.status !== "authenticated") return unavailable(503);
      if (!uuid.test(documentId) || !/^[1-9][0-9]*$/.test(number) || !Number.isSafeInteger(Number(number))) return unavailable();

      // document_versions solo contiene publicaciones; no leer operaciones ni detalles privados.
      const version = await client.from("document_versions").select("id, version_number, public_reference")
        .eq("document_id", documentId).eq("version_number", Number(number)).maybeSingle();
      if (version.error) return unavailable(503);
      if (!version.data) return unavailable();
      const artifact = await client.from("version_artifacts").select("bucket, object_path")
        .eq("version_id", version.data.id).eq("kind", "pdf").maybeSingle();
      if (artifact.error) return unavailable(503);
      if (!artifact.data || artifact.data.bucket !== "versions-private") return unavailable();

      if (!download) return Response.json({ versionNumber: version.data.version_number, publicReference: version.data.public_reference }, { headers });
      const object = await client.storage.from("versions-private").download(artifact.data.object_path);
      if (object.error || !object.data) return unavailable();
      return new Response(object.data.stream(), {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="galcoa-version-${Number(number)}.pdf"`,
        },
      });
    } catch {
      return unavailable(503);
    }
  };
}
