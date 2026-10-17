import "server-only";

import { z } from "zod";

import { OperationContentSchema, type Draft } from "@/lib/contracts/core";
import { InstantSchema } from "@/lib/contracts/common";

import type { DocumentRpc } from "../persistence/store";

import type { ContrastStore, SaveReportInput } from "./ports";

/**
 * Adaptador SQL del reporte de contraste (migración 02502; docs/design/durable-chat-turns.md).
 * Solo `persist_contrast_report`: SQL compara id, revisión y contenido de `b1` con el borrador
 * vigente antes de escribir, por eso el contenido evaluado viaja desde el servicio y no se relee.
 * La lectura del borrador no tiene RPC todavía: se inyecta (`readDraft`) y queda pendiente.
 */

/** Error opaco: nunca conserva mensajes, SQL ni credenciales. */
export class ContrastPersistenceError extends Error {
  constructor(readonly code: "NO_SESSION" | "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Persistencia del contraste no disponible");
  }
}

const UUID = z.uuid();
const KIND_BY_PREFIX = { m: "mensaje", e: "extraccion", b: "borrador" } as const;

const InputSchema = z
  .strictObject({ ref: z.string().regex(/^[meb][0-9]{1,3}$/), kind: z.enum(["mensaje", "extraccion", "borrador"]), id: UUID })
  .refine((i) => i.kind === KIND_BY_PREFIX[i.ref[0] as keyof typeof KIND_BY_PREFIX]);
const FindingSchema = z.strictObject({
  message: z.string().min(1).max(4000),
  severity: z.enum(["warning", "critical"]),
  sourceRefs: z.array(z.string()).min(1).max(401),
});
const ReportSchema = z.strictObject({
  ownerId: UUID,
  documentId: UUID,
  draftId: UUID,
  draftRevision: z.number().int().min(1),
  draftContent: OperationContentSchema,
  correlationId: z.string().min(1).max(128),
  result: z.enum(["sin_inconsistencias_criticas_detectadas", "con_advertencias", "contradiccion_critica"]),
  findings: z.array(FindingSchema).max(200),
  inputs: z.array(InputSchema).min(1).max(401),
  modelId: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(50),
});
const resultSchema = z.union([
  z.strictObject({ status: z.literal("created"), reportId: UUID, createdAt: InstantSchema }),
  z.strictObject({ status: z.enum(["stale_draft", "not_available"]) }),
]);

export type DraftReader = (ownerId: string, documentId: string) => Promise<Draft | null>;

/** Solo después de `Auth.getUser()`. `executor` debe ser el canal `galcoa_executor` (nunca `service_role`). */
export function createContrastStore(context: { verifiedUserId: string; executor: DocumentRpc; readDraft: DraftReader }): ContrastStore {
  function actor(owner: string) {
    if (!context.verifiedUserId || owner !== context.verifiedUserId) throw new ContrastPersistenceError("NO_SESSION");
  }
  return {
    async getCurrentDraft(ownerId, documentId) {
      actor(ownerId);
      if (!UUID.safeParse(documentId).success) throw new ContrastPersistenceError("INVALID_INPUT");
      let draft: Draft | null;
      try {
        draft = await context.readDraft(ownerId, documentId);
      } catch {
        throw new ContrastPersistenceError("UNAVAILABLE");
      }
      if (draft && draft.documentId !== documentId) throw new ContrastPersistenceError("INVALID_RESPONSE");
      return draft;
    },
    async saveReport(i: SaveReportInput) {
      // Actor y forma antes de cualquier E/S.
      actor(i.ownerId);
      const parsed = ReportSchema.safeParse(i);
      if (!parsed.success) throw new ContrastPersistenceError("INVALID_INPUT");
      const r = parsed.data;
      const b1 = r.inputs.filter((x) => x.kind === "borrador");
      if (b1.length !== 1 || b1[0].ref !== "b1" || b1[0].id !== r.draftId) throw new ContrastPersistenceError("INVALID_INPUT");
      const known = new Set(r.inputs.map((x) => x.ref));
      if (known.size !== r.inputs.length || r.findings.some((f) => f.sourceRefs.some((ref) => !known.has(ref)))) {
        throw new ContrastPersistenceError("INVALID_INPUT");
      }

      let response: { data: unknown; error: unknown };
      try {
        // pg convierte arrays JS en arrays de Postgres: todo jsonb viaja ya serializado.
        response = await context.executor.rpc("persist_contrast_report", {
          p_actor_id: r.ownerId, p_document_id: r.documentId, p_draft_id: r.draftId, p_draft_revision: r.draftRevision,
          p_draft_content: JSON.stringify(r.draftContent), p_result: r.result, p_findings: JSON.stringify(r.findings),
          p_inputs: JSON.stringify(r.inputs), p_model_id: r.modelId, p_prompt_version: r.promptVersion,
          p_limitations: JSON.stringify(r.limitations), p_correlation_id: r.correlationId,
        });
      } catch {
        throw new ContrastPersistenceError("UNAVAILABLE");
      }
      if (response.error) {
        const code = typeof response.error === "object" && response.error !== null && "code" in response.error ? response.error.code : undefined;
        throw new ContrastPersistenceError(code === "42501" ? "NO_SESSION" : code === "22023" ? "INVALID_INPUT" : "UNAVAILABLE");
      }
      const out = resultSchema.safeParse(response.data);
      if (!out.success) throw new ContrastPersistenceError("INVALID_RESPONSE");
      return out.data;
    },
  };
}
