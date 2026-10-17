import "server-only";

import { z } from "zod";

import { HcsStatusSchema } from "@/lib/contracts/document";

import type { DocumentRpc } from "../persistence/store";

import type { PublicVerificationStore } from "./service";

/**
 * Adaptador de `get_public_verification` (MVP-100; INV-15, SH-02). Cliente **anónimo**: el rol `anon` no
 * lee tablas, solo ejecuta esta función de proyección mínima. La respuesta se valida con un esquema
 * cerrado; un error de SDK o SQL no cruza la frontera (ni se distingue de otro fallo técnico).
 */

const Hash = z.string().regex(/^[0-9a-f]{64}$/);

const ResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("found"),
    record: z.strictObject({
      reference: z.string().regex(/^[0-9a-f]{32}$/),
      envelope: z.strictObject({ pdfHash: Hash, privateDetailHash: Hash }),
      manifestHash: Hash,
      hcsStatus: HcsStatusSchema,
      registration: z
        .strictObject({
          network: z.literal("testnet"),
          topicId: z.string().regex(/^0\.0\.\d+$/),
          sequenceNumber: z.string().regex(/^\d+$/),
          transactionId: z.string().min(1).max(128),
        })
        .nullable(),
    }),
  }),
  z.strictObject({ status: z.literal("not_available") }),
]);

export function createSupabasePublicVerificationStore(rpc: DocumentRpc): PublicVerificationStore {
  return {
    async getByReference(reference) {
      const { data, error } = await rpc.rpc("get_public_verification", { p_reference: reference });
      if (error) throw new Error("Persistencia no disponible");
      const parsed = ResultSchema.safeParse(data);
      if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
      return parsed.data.status === "found" ? parsed.data.record : null;
    },
  };
}
