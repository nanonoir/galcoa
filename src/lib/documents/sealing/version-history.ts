import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { HcsStatus } from "@/lib/contracts/document";
import type { VersionHistoryItem, VersionHistoryViewState } from "@/lib/contracts/version-history-view";

import type { SealingStore } from "./ports";

/**
 * Lectura de servidor del historial de versiones finalizadas de un documento (REQ-09). Las filas salen
 * de `document_versions` con la sesión del propietario (RLS `*_owner_select`: un documento ajeno no
 * devuelve filas); el sello de cada una, de `SealingStore.loadSealState`. Un fallo al leer las versiones
 * es `error` (nunca una lista vacía inventada); un fallo al leer solo el sello deja ese sello
 * `pendiente`, sin afirmar registro. Proyección por allowlist: sin hashes, referencias ni ubicaciones.
 */

const Row = z.object({
  id: z.uuid(),
  revision_id: z.uuid(),
  snapshot_id: z.uuid(),
  version_number: z.number().int().positive(),
  previous_version_id: z.uuid().nullable(),
  finalized_at: z.string().min(1),
});

const ERROR_MESSAGE = "No se pudieron leer las versiones finalizadas. Reintentá en unos instantes.";

async function hcsStatusOf(versionId: string, sealing: Pick<SealingStore, "loadSealState"> | undefined): Promise<HcsStatus> {
  try {
    const state = await sealing?.loadSealState(versionId);
    if (state?.registration) return "registrado";
    if (state?.latestAttempt?.outcome === "fallido") return "fallido";
    if (state && !state.latestAttempt) return "no_iniciado";
  } catch {
    // Sin lectura del sello no se afirma nada: sigue pendiente.
  }
  return "pendiente";
}

export async function readVersionHistory(context: {
  documentId: string;
  session: Pick<SupabaseClient, "from">;
  /** `undefined` si el canal del ejecutor no está disponible: cada sello se informa como pendiente. */
  sealing: Pick<SealingStore, "loadSealState"> | undefined;
}): Promise<VersionHistoryViewState> {
  try {
    const { data, error } = await context.session
      .from("document_versions")
      .select("id, revision_id, snapshot_id, version_number, previous_version_id, finalized_at")
      .eq("document_id", context.documentId)
      .order("version_number", { ascending: false });
    if (error) return { status: "error", message: ERROR_MESSAGE };
    const rows = z.array(Row).parse(data ?? []);
    const versions: VersionHistoryItem[] = await Promise.all(
      rows.map(async (row) => ({
        versionId: row.id,
        number: row.version_number,
        previousVersionId: row.previous_version_id,
        revisionId: row.revision_id,
        snapshotId: row.snapshot_id,
        finalizedAt: new Date(row.finalized_at).toISOString(),
        hcsStatus: await hcsStatusOf(row.id, context.sealing),
      })),
    );
    return { status: "ready", versions };
  } catch {
    return { status: "error", message: ERROR_MESSAGE };
  }
}
