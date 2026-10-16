import "server-only";

import { z } from "zod";

import { ParticipantSelectionSchema } from "@/lib/contracts/review";

import type { DocumentRpc } from "../persistence/store";

import type { AggregateStore, RateLimitStore } from "./ports";

/**
 * Adaptadores Supabase de MVP-075: estado de la revisión para el autor (sesión
 * verificada; la propiedad la decide `auth.uid()` en la base) y contador de
 * abuso (cliente anónimo, ventana fija en Postgres, solo hashes de origen).
 */

const StateSchema = z.strictObject({
  revisionId: z.string(),
  snapshotId: z.string(),
  documentId: z.string(),
  selection: ParticipantSelectionSchema,
  superseded: z.boolean(),
  responses: z.array(z.strictObject({
    role: z.enum(["autor", "intermediario", "comprador"]),
    response: z.enum(["confirmado", "rechazado"]),
    snapshotId: z.string(),
    respondedAt: z.string(),
  })),
});

export function createSupabaseAggregateStore(context: { verifiedUserId: string; session: DocumentRpc }): AggregateStore {
  return {
    async getRevisionState(ownerId, revisionId) {
      if (!ownerId || ownerId !== context.verifiedUserId) throw new Error("Operación no autorizada");
      const { data, error } = await context.session.rpc("get_revision_state", { p_revision_id: revisionId });
      if (error) throw new Error("Persistencia no disponible");
      if (data === null) return null;
      const state = StateSchema.parse(data);
      if (state.revisionId !== revisionId) throw new Error("Respuesta de persistencia inválida");
      return state;
    },
  };
}

export function createSupabaseRateLimitStore(rpc: DocumentRpc): RateLimitStore {
  return {
    async hit({ kind, originHash, windowStart }) {
      const { data, error } = await rpc.rpc("hit_rate_limit", { p_kind: kind, p_origin_hash: originHash, p_window_start: windowStart });
      if (error) throw new Error("Persistencia no disponible");
      return { count: z.number().int().positive().parse(data) };
    },
  };
}
