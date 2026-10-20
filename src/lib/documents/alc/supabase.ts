import "server-only";

import { z } from "zod";

import type { DocumentRpc } from "../persistence/store";

import type { AlcStore } from "./service";

/**
 * Adaptador del ejecutor para `save_alc_evaluation` (F-1). Solo el ejecutor escribe evaluaciones: la sesión del autor no
 * puede inventar un color. La identidad la liga el ejecutor (`p_actor_id`) y debe ser la verificada. Un error del SDK o
 * de SQL no cruza la frontera: sale como «persistencia no disponible» (el servicio lo traduce a fallo técnico).
 */

const SaveResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("saved"), evaluationId: z.uuid() }),
  z.strictObject({ status: z.enum(["stale_draft", "selection_invalid", "inventory_mismatch", "result_inconsistent", "not_available"]) }),
]);

export function createAlcStore(context: { verifiedUserId: string; executor: DocumentRpc }): AlcStore {
  return {
    async save(input) {
      if (!input.ownerId || input.ownerId !== context.verifiedUserId) throw new Error("Operación no autorizada");
      const { data, error } = await context.executor.rpc("save_alc_evaluation", {
        p_actor_id: input.ownerId,
        p_document_id: input.documentId,
        p_draft_revision: input.draftRevision,
        p_selection: input.selection,
        p_rules_version: input.rulesVersion,
        p_input: JSON.stringify(input.input),
        p_input_hash: input.inputHash,
        p_color: input.color,
        p_result: JSON.stringify(input.result),
        p_shared: JSON.stringify(input.shared),
        p_rectifications: JSON.stringify(input.rectifications),
        p_source_aliases: JSON.stringify(input.sourceAliases),
        p_inventory: JSON.stringify(input.inventory),
        p_correlation_id: input.correlationId,
      });
      if (error) throw new Error("Persistencia de evaluación no disponible");
      return SaveResultSchema.parse(data);
    },
  };
}
