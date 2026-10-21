import "server-only";

import { z } from "zod";

import { FrozenContentSchema } from "@/lib/contracts/review";
import type { TechnicalError } from "@/lib/contracts/technical";

import { failure, newId } from "../result";
import type { DocumentRpc } from "../persistence/store";
import { renderFinalPdf, type PdfInput } from "../pdf/render";
import { verifyUrlFor } from "../pdf/verify-url";

import { buildReceipts, ReceiptsError } from "./receipts";

/**
 * Staging canónico del PDF bajo el claim (MVP-081, C081-2; migración 02506). El PDF se renderiza desde
 * el snapshot persistido y las respuestas persistidas del mismo snapshot, nunca desde datos del navegador.
 * Los bytes se guardan una vez, con el fencing vigente; un reintento reutiliza los guardados y no
 * renderiza otra vez. Aquí no se publica la versión, no hay Storage ni Hedera. El fencing viene del
 * claim en el servidor y no se proyecta al cliente. Un error de SDK/SQL no cruza la frontera.
 */

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Staged = z.strictObject({ sha256: Sha256, byteLength: z.number().int().positive() });

const RenderInputSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    operationId: Uuid, revisionId: Uuid, phase: z.string(), renderer: z.string().min(1), publicReference: z.string().min(1),
    snapshotHash: Sha256, claimedAt: z.string().min(1), content: FrozenContentSchema,
    receipts: z.array(z.strictObject({
      responseId: Uuid, role: z.enum(["autor", "intermediario", "comprador"]), decision: z.literal("confirmar"),
      declaredName: z.string().nullable(), respondedAt: z.string().min(1),
    })),
    staged: Staged.nullable(),
  }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing"]) }),
]);
const StageResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["staged", "already_staged", "conflict"]), sha256: Sha256, byteLength: z.number().int().positive() }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing", "lease_expired"]) }),
]);

export type RenderInputResult = z.infer<typeof RenderInputSchema>;
export type StageResult = z.infer<typeof StageResultSchema>;

export type PdfStagingStore = {
  renderInput(input: { operationId: string; fencing: number }): Promise<RenderInputResult>;
  stage(input: { operationId: string; fencing: number; bytes: Uint8Array; correlationId: string }): Promise<StageResult>;
};

/** `executor` debe ser el canal `galcoa_executor` (nunca `service_role` ni la sesión del propietario). */
export function createSupabasePdfStagingStore(context: { verifiedUserId: string; executor: DocumentRpc }): PdfStagingStore {
  async function call<T>(schema: z.ZodType<T>, name: string, args: Record<string, unknown>): Promise<T> {
    if (!context.verifiedUserId) throw new Error("Operación no autorizada");
    const { data, error } = await context.executor.rpc(name, { p_actor_id: context.verifiedUserId, ...args });
    if (error) throw new Error("Persistencia no disponible");
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
    return parsed.data;
  }
  return {
    renderInput: (i) => call(RenderInputSchema, "get_finalization_render_input", { p_operation_id: i.operationId, p_fencing: i.fencing }),
    stage: (i) =>
      call(StageResultSchema, "stage_finalization_pdf", {
        p_operation_id: i.operationId, p_fencing: i.fencing, p_content: Buffer.from(i.bytes), p_correlation_id: i.correlationId,
      }),
  };
}

export type StagedPdf = { sha256: string; byteLength: number; reused: boolean };
export type StagingResult = { ok: true; value: StagedPdf } | { ok: false; error: TechnicalError };

export type PdfStagingDeps = {
  store: PdfStagingStore;
  render?: typeof renderFinalPdf;
  /** Enlace del verificador público para el QR del PDF; por defecto sale de `NEXT_PUBLIC_APP_URL`. */
  verifyUrl?: (publicReference: string) => string | null;
  newCorrelationId?: () => string;
};

const STATUS_CODES = { not_available: "NOT_AVAILABLE", abandoned: "FINALIZATION_ABANDONED", stale_fencing: "STALE_CLAIM", lease_expired: "STALE_CLAIM" } as const;

export function createPdfStagingService(deps: PdfStagingDeps) {
  const render = deps.render ?? renderFinalPdf;
  const verifyUrl = deps.verifyUrl ?? ((reference: string) => verifyUrlFor(reference));
  const correlation = deps.newCorrelationId ?? newId;
  return {
    /** Guarda el PDF canónico de la operación; idempotente con el mismo fencing, rechaza uno anterior. */
    async stagePdf(input: { operationId: string; fencing: number }): Promise<StagingResult> {
      const correlationId = correlation();
      const fail = (code: string, retryable = false) => failure(code, "persistencia", retryable, correlationId);
      if (!Uuid.safeParse(input.operationId).success || !Number.isSafeInteger(input.fencing) || input.fencing < 1) return fail("INVALID_INPUT");
      try {
        const loaded = await deps.store.renderInput(input);
        if (loaded.status !== "ready") return fail(STATUS_CODES[loaded.status]);
        // Ya hay bytes canónicos: se reutilizan, nunca se renderiza otra vez.
        if (loaded.staged) return { ok: true, value: { ...loaded.staged, reused: true } };

        // Constancias que no cubren la selección no se arreglan reintentando: error técnico no reintentable.
        let receipts: PdfInput["receipts"];
        try {
          receipts = buildReceipts(loaded.content.selection, loaded.receipts);
        } catch (error) {
          return error instanceof ReceiptsError ? fail("RECEIPTS_INCOMPLETE") : fail("RENDER_FAILED", true);
        }

        let rendered: Awaited<ReturnType<typeof renderFinalPdf>>;
        try {
          const pdf: PdfInput = {
            content: loaded.content,
            receipts,
            revisionId: loaded.revisionId,
            snapshotHash: loaded.snapshotHash,
            publicReference: loaded.publicReference,
            finalizedAt: loaded.claimedAt,
            verifyUrl: verifyUrl(loaded.publicReference),
          };
          rendered = await render(pdf);
        } catch {
          // Impedimento técnico reintentable: nunca un PDF parcial ni un éxito.
          return fail("RENDER_FAILED", true);
        }

        const stored = await deps.store.stage({ operationId: input.operationId, fencing: input.fencing, bytes: rendered.bytes, correlationId });
        if (stored.status === "conflict") return fail("ARTIFACT_CONFLICT");
        if (stored.status !== "staged" && stored.status !== "already_staged") return fail(STATUS_CODES[stored.status]);
        // Hash y longitud los deriva la base de los bytes; deben coincidir con lo enviado.
        if (stored.sha256 !== rendered.sha256 || stored.byteLength !== rendered.byteLength) return fail("TECHNICAL_FAILURE", true);
        return { ok: true, value: { sha256: stored.sha256, byteLength: stored.byteLength, reused: stored.status === "already_staged" } };
      } catch {
        return fail("TECHNICAL_FAILURE", true);
      }
    },
  };
}
