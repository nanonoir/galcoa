import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SealedVersionSeal, SealedVersionView } from "@/lib/contracts/sealed-version-view";

import type { SealingStore } from "./ports";

/**
 * Lectura de servidor de la ÚLTIMA versión publicada de un documento con su sello. La versión sale de
 * `document_versions` con la sesión del propietario (RLS `*_owner_select`: un documento ajeno no
 * devuelve nada); el sello, de `SealingStore.loadSealState`, que conserva `consensusTimestamp` exacto
 * (`segundos.nanos`). Solo hashes e identificadores públicos (INV-06). Un fallo al leer el sello no
 * afirma registro: queda `pendiente`.
 */

const Row = z.object({
  revision_id: z.uuid(),
  version_number: z.number().int().positive(),
  public_reference: z.string().min(1),
  manifest_hash: z.string().regex(/^[0-9a-f]{64}$/),
  finalized_at: z.string().min(1),
  id: z.uuid(),
});

export async function readLatestSealedVersion(context: {
  documentId: string;
  session: Pick<SupabaseClient, "from">;
  /** `undefined` si el canal del ejecutor no está disponible: el sello se informa como pendiente. */
  sealing: Pick<SealingStore, "loadSealState"> | undefined;
}): Promise<SealedVersionView | null> {
  const { data, error } = await context.session
    .from("document_versions")
    .select("id, revision_id, version_number, public_reference, manifest_hash, finalized_at")
    .eq("document_id", context.documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Persistencia no disponible");
  if (!data) return null;
  const row = Row.parse(data);

  let seal: SealedVersionSeal = { status: "pendiente" };
  try {
    const state = await context.sealing?.loadSealState(row.id);
    if (state?.registration) {
      const { topicId, sequenceNumber, transactionId, consensusTimestamp } = state.registration;
      seal = { status: "registrado", topicId, sequenceNumber, transactionId, consensusTimestamp };
    } else if (state?.latestAttempt?.outcome === "fallido") seal = { status: "fallido" };
    else if (state && !state.latestAttempt) seal = { status: "no_iniciado" };
  } catch {
    // Sin lectura del sello no se afirma nada: sigue pendiente.
  }

  return {
    documentId: context.documentId,
    revisionId: row.revision_id,
    versionNumber: row.version_number,
    reference: row.public_reference,
    documentHash: row.manifest_hash,
    finalizedAt: new Date(row.finalized_at).toISOString(),
    seal,
  };
}
