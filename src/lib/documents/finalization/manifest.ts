import "server-only";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";

import { canonicalHash } from "../manifest/jcs";
import { buildEnvelope, NonceSchema, PRIVATE_DETAIL_SCHEMA_VERSION_V2, PrivateDetailSchema, privateDetailHash, type Envelope, type PrivateDetail } from "../manifest/manifest";
import type { DocumentRpc } from "../persistence/store";
import { failure, newId } from "../result";

/**
 * Manifiesto privado durable bajo el claim (MVP-082; migración 02509). El detalle privado se arma solo
 * con lo persistido (evidencias y reportes citados por el snapshot, constancias del mismo snapshot,
 * antecedente y nonce reservados al claim), se serializa en JCS y sus bytes se guardan una vez antes de
 * cualquier subida o publicación. El envelope público y el `manifestHash` se calculan aquí y la base los
 * recalcula de forma independiente. Un reintento reutiliza los bytes guardados. Sin Storage ni Hedera.
 */

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const Role = z.enum(["autor", "intermediario", "comprador"]);
const Staged = z.strictObject({ sha256: Sha256, byteLength: z.number().int().positive() });

const ManifestInputSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    operationId: Uuid, phase: z.string(), versionId: Uuid, revisionId: Uuid, snapshotId: Uuid, snapshotHash: Sha256,
    publicReference: z.string().min(1), nonce: NonceSchema,
    pdf: Staged,
    evidences: z.array(z.strictObject({ evidenceId: Uuid, sha256: Sha256 })),
    reports: z.array(z.strictObject({
      reportId: Uuid,
      report: z.strictObject({
        input: z.unknown(), output: z.unknown(), model: z.string(), promptVersion: z.string(), rulesVersion: z.string(), limitations: z.unknown(),
      }),
      sources: z.array(z.strictObject({ type: z.enum(["message", "evidence", "extraction"]), id: Uuid })),
    })),
    confirmations: z.array(z.strictObject({
      responseId: Uuid, role: Role, snapshotHash: Sha256, decision: z.literal("confirmar"), checkbox: z.boolean(),
      declaredName: z.string().nullable(), ratifiedRejection: z.boolean(), respondedAt: Instant,
    })),
    previousVersion: z.strictObject({ versionId: Uuid, manifestHash: Sha256 }).nullable(),
    /** Evaluación ALC de la revisión; `null`/ausente para revisiones históricas (detalle v1). */
    alc: z.strictObject({ evaluationId: Uuid, rulesVersion: z.string().min(1), color: z.enum(["verde", "amarillo", "rojo"]), inputHash: Sha256 }).nullish(),
    staged: Staged.nullable(),
  }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing", "pdf_missing"]) }),
]);
const PrepareResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["prepared", "already_prepared", "conflict"]), sha256: Sha256, byteLength: z.number().int().positive(), manifestHash: Sha256 }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing", "lease_expired"]) }),
]);

export type ManifestInputResult = z.infer<typeof ManifestInputSchema>;
export type PrepareResult = z.infer<typeof PrepareResultSchema>;

export type ManifestStore = {
  input(input: { operationId: string; fencing: number }): Promise<ManifestInputResult>;
  prepare(input: { operationId: string; fencing: number; detail: Uint8Array; correlationId: string }): Promise<PrepareResult>;
};

/** `executor` debe ser el canal `galcoa_executor` (nunca `service_role` ni la sesión del propietario). */
export function createSupabaseManifestStore(context: { verifiedUserId: string; executor: DocumentRpc }): ManifestStore {
  async function call<T>(schema: z.ZodType<T>, name: string, args: Record<string, unknown>): Promise<T> {
    if (!context.verifiedUserId) throw new Error("Operación no autorizada");
    const { data, error } = await context.executor.rpc(name, { p_actor_id: context.verifiedUserId, ...args });
    if (error) throw new Error("Persistencia no disponible");
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
    return parsed.data;
  }
  return {
    input: (i) => call(ManifestInputSchema, "get_finalization_manifest_input", { p_operation_id: i.operationId, p_fencing: i.fencing }),
    prepare: (i) =>
      call(PrepareResultSchema, "prepare_finalization_manifest", {
        p_operation_id: i.operationId, p_fencing: i.fencing, p_detail: Buffer.from(i.detail), p_correlation_id: i.correlationId,
      }),
  };
}

export type PreparedManifest = { privateDetailHash: string; manifestHash: string; envelope: Envelope; reused: boolean };
export type ManifestResult = { ok: true; value: PreparedManifest } | { ok: false; error: TechnicalError };

const STATUS_CODES = { not_available: "NOT_AVAILABLE", abandoned: "FINALIZATION_ABANDONED", stale_fencing: "STALE_CLAIM", lease_expired: "STALE_CLAIM", pdf_missing: "TECHNICAL_FAILURE" } as const;
const byUtf16 = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Detalle privado desde lo persistido; el esquema estricto rechaza cualquier campo de más o de menos. */
function buildDetail(input: Extract<ManifestInputResult, { status: "ready" }>): PrivateDetail {
  return PrivateDetailSchema.parse({
    schemaVersion: input.alc ? PRIVATE_DETAIL_SCHEMA_VERSION_V2 : "galcoa.private-detail.v1",
    versionId: input.versionId, revisionId: input.revisionId, snapshotId: input.snapshotId, snapshotHash: input.snapshotHash,
    evidences: [...input.evidences].sort((a, b) => byUtf16(a.evidenceId, b.evidenceId)),
    reports: [...input.reports].sort((a, b) => byUtf16(a.reportId, b.reportId)).map((r) => ({
      reportId: r.reportId,
      // Hash de los bytes canónicos (JCS) del reporte persistido: no se vuelve a consultar ningún modelo.
      sha256: canonicalHash(r.report).hash,
      sources: r.sources
        .map((s) => ({ type: s.type, id: s.id, page: null, region: null }))
        .sort((a, b) => byUtf16(`${a.type}\u0000${a.id}`, `${b.type}\u0000${b.id}`)),
    })),
    confirmations: input.confirmations,
    previousVersion: input.previousVersion,
    nonce: input.nonce,
    ...(input.alc ? { alc: input.alc } : {}),
  });
}

export function createManifestService(deps: { store: ManifestStore; newCorrelationId?: () => string }) {
  const correlation = deps.newCorrelationId ?? newId;
  return {
    /** Persiste el detalle privado y calcula envelope y `manifestHash`; idempotente con el mismo fencing. */
    async prepareManifest(input: { operationId: string; fencing: number }): Promise<ManifestResult> {
      const correlationId = correlation();
      const fail = (code: string, retryable = false) => failure(code, "persistencia", retryable, correlationId);
      if (!Uuid.safeParse(input.operationId).success || !Number.isSafeInteger(input.fencing) || input.fencing < 1) return fail("INVALID_INPUT");
      try {
        const loaded = await deps.store.input(input);
        if (loaded.status !== "ready") return fail(STATUS_CODES[loaded.status], loaded.status === "pdf_missing");

        const envelopeFor = (detailHash: string) => buildEnvelope({ reference: loaded.publicReference, pdfHash: loaded.pdf.sha256, privateDetailHash: detailHash });
        // El detalle ya está guardado: se reutilizan sus bytes, nunca se reconstruye con datos nuevos.
        if (loaded.staged) {
          const { envelope, manifestHash } = envelopeFor(loaded.staged.sha256);
          return { ok: true, value: { privateDetailHash: loaded.staged.sha256, manifestHash, envelope, reused: true } };
        }

        let detail: { bytes: Uint8Array; hash: string };
        try {
          detail = privateDetailHash(buildDetail(loaded));
        } catch {
          // Datos persistidos que no forman un detalle válido no se arreglan reintentando.
          return fail("MANIFEST_INVALID");
        }
        const stored = await deps.store.prepare({ ...input, detail: detail.bytes, correlationId });
        if (stored.status === "conflict") return fail("ARTIFACT_CONFLICT");
        if (stored.status !== "prepared" && stored.status !== "already_prepared") return fail(STATUS_CODES[stored.status]);
        const { envelope, manifestHash } = envelopeFor(detail.hash);
        // Hash y longitud los deriva la base de los bytes; el manifestHash se recalcula en SQL: deben coincidir.
        if (stored.sha256 !== detail.hash || stored.byteLength !== detail.bytes.byteLength || stored.manifestHash !== manifestHash) return fail("TECHNICAL_FAILURE", true);
        return { ok: true, value: { privateDetailHash: detail.hash, manifestHash, envelope, reused: stored.status === "already_prepared" } };
      } catch {
        return fail("TECHNICAL_FAILURE", true);
      }
    },
  };
}
