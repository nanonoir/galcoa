import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { DocumentRpc } from "../persistence/store";
import { failure, newId } from "../result";

/**
 * Publicación atómica de la versión inmutable (MVP-083; migración 02511). Con el manifiesto listo se reservan
 * los objetos privados, se suben los bytes del staging tal cual (sin render ni reconstrucción), se relee cada
 * objeto y se compara hash y longitud antes de aceptarlo, y recién entonces una RPC inserta la versión bajo
 * fencing y lease. Nunca se sobrescribe: un objeto existente con bytes iguales se acepta (reintento tras
 * «upload ok / commit fallido»); con bytes distintos es un error técnico. Sin Hedera: el sello queda
 * `no_iniciado`. El fencing sale del claim en el servidor y no se proyecta al cliente.
 */

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Size = z.number().int().positive();
const Kind = z.enum(["pdf", "manifest"]);
type Kind = z.infer<typeof Kind>;
const Published = { versionId: Uuid, versionNumber: Size, manifestHash: Sha256 };

const ReserveResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("reserved"),
    artifacts: z.array(z.strictObject({ kind: Kind, objectPath: z.string().min(1), sha256: Sha256, byteLength: Size })).length(2),
  }),
  z.strictObject({ status: z.literal("already_published"), ...Published }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing", "lease_expired"]) }),
]);
const StagedContentSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), sha256: Sha256, byteLength: Size, contentHex: z.string().regex(/^(?:[0-9a-f]{2})+$/) }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing"]) }),
]);
const PublishResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["published", "already_published"]), ...Published }),
  z.strictObject({ status: z.enum(["not_available", "abandoned", "stale_fencing", "lease_expired", "conflict"]) }),
]);

export type ReserveResult = z.infer<typeof ReserveResultSchema>;
export type StagedContentResult = z.infer<typeof StagedContentSchema>;
export type PublishResult = z.infer<typeof PublishResultSchema>;
export type Artifact = { kind: Kind; sha256: string; byteLength: number };

export type VersionPublishStore = {
  reserve(input: { operationId: string; fencing: number; correlationId: string }): Promise<ReserveResult>;
  staged(input: { operationId: string; fencing: number; kind: Kind }): Promise<StagedContentResult>;
  publish(input: { operationId: string; fencing: number; pdf: Artifact; manifest: Artifact; correlationId: string }): Promise<PublishResult>;
};

/** `executor` debe ser el canal `galcoa_executor` (nunca `service_role` ni la sesión del propietario). */
export function createSupabaseVersionPublishStore(context: { verifiedUserId: string; executor: DocumentRpc }): VersionPublishStore {
  async function call<T>(schema: z.ZodType<T>, name: string, args: Record<string, unknown>): Promise<T> {
    if (!context.verifiedUserId) throw new Error("Operación no autorizada");
    const { data, error } = await context.executor.rpc(name, { p_actor_id: context.verifiedUserId, ...args });
    if (error) throw new Error("Persistencia no disponible");
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Respuesta de persistencia inválida");
    return parsed.data;
  }
  return {
    reserve: (i) =>
      call(ReserveResultSchema, "reserve_finalization_objects", { p_operation_id: i.operationId, p_fencing: i.fencing, p_correlation_id: i.correlationId }),
    staged: (i) => call(StagedContentSchema, "get_finalization_staged_content", { p_operation_id: i.operationId, p_fencing: i.fencing, p_kind: i.kind }),
    publish: (i) =>
      call(PublishResultSchema, "publish_version", {
        p_operation_id: i.operationId, p_fencing: i.fencing,
        p_pdf_sha256: i.pdf.sha256, p_pdf_length: i.pdf.byteLength,
        p_manifest_sha256: i.manifest.sha256, p_manifest_length: i.manifest.byteLength,
        p_correlation_id: i.correlationId,
      }),
  };
}

/** Storage privado sin sobrescritura: `upload` devuelve `exists` si el nombre ya está tomado; `download` null si falta. */
export type ArtifactStorage = {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<"created" | "exists">;
  download(path: string): Promise<Uint8Array | null>;
};

export type PublishedVersion = { versionId: string; versionNumber: number; manifestHash: string; reused: boolean };
export type PublishResultValue = { ok: true; value: PublishedVersion } | { ok: false; error: TechnicalError };

const STATUS_CODES = {
  not_available: "NOT_AVAILABLE", abandoned: "FINALIZATION_ABANDONED", stale_fencing: "STALE_CLAIM", lease_expired: "STALE_CLAIM", conflict: "ARTIFACT_CONFLICT",
} as const;
const CONTENT_TYPES: Record<Kind, string> = { pdf: "application/pdf", manifest: "application/json" };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function createVersionPublishService(deps: { store: VersionPublishStore; storage: ArtifactStorage; newCorrelationId?: () => string }) {
  const correlation = deps.newCorrelationId ?? newId;
  return {
    /** Sube y verifica ambos artefactos y publica la versión; idempotente con el mismo fencing. */
    async publishVersion(input: { operationId: string; fencing: number }): Promise<PublishResultValue> {
      const correlationId = correlation();
      const fail = (code: string, retryable = false) => failure(code, "persistencia", retryable, correlationId);
      if (!Uuid.safeParse(input.operationId).success || !Number.isSafeInteger(input.fencing) || input.fencing < 1) return fail("INVALID_INPUT");
      try {
        const reserved = await deps.store.reserve({ ...input, correlationId });
        if (reserved.status === "already_published") return { ok: true, value: { ...pick(reserved), reused: true } };
        if (reserved.status !== "reserved") return fail(STATUS_CODES[reserved.status]);

        const verified: Artifact[] = [];
        for (const artifact of reserved.artifacts) {
          const staged = await deps.store.staged({ ...input, kind: artifact.kind });
          if (staged.status !== "ready") return fail(STATUS_CODES[staged.status]);
          const bytes = Buffer.from(staged.contentHex, "hex");
          // Los bytes guardados deben repetir lo reservado: si no, algo cambió y no se sube nada.
          if (digest(bytes) !== artifact.sha256 || bytes.byteLength !== artifact.byteLength || staged.sha256 !== artifact.sha256) return fail("ARTIFACT_CONFLICT");

          // Sin overwrite: «exists» no es error, se decide por la relectura (hash y longitud) antes de aceptar.
          try {
            await deps.storage.upload(artifact.objectPath, bytes, CONTENT_TYPES[artifact.kind]);
          } catch {
            // Storage puede responder 400 o 409 por duplicado, o perder la respuesta tras guardar.
            // Solo la relectura de los bytes permite aceptar ese resultado incierto.
            const existing = await deps.storage.download(artifact.objectPath);
            if (!existing) return fail("TECHNICAL_FAILURE", true);
            if (existing.byteLength !== artifact.byteLength || digest(existing) !== artifact.sha256) return fail("ARTIFACT_CONFLICT");
          }
          const stored = await deps.storage.download(artifact.objectPath);
          if (!stored) return fail("TECHNICAL_FAILURE", true);
          if (stored.byteLength !== artifact.byteLength || digest(stored) !== artifact.sha256) return fail("ARTIFACT_CONFLICT");
          verified.push({ kind: artifact.kind, sha256: artifact.sha256, byteLength: artifact.byteLength });
        }
        const pdf = verified.find((a) => a.kind === "pdf");
        const manifest = verified.find((a) => a.kind === "manifest");
        if (!pdf || !manifest) return fail("TECHNICAL_FAILURE", true);

        const published = await deps.store.publish({ ...input, pdf, manifest, correlationId });
        if (published.status !== "published" && published.status !== "already_published") return fail(STATUS_CODES[published.status]);
        return { ok: true, value: { ...pick(published), reused: published.status === "already_published" } };
      } catch {
        // Un fallo de Storage o de la RPC no publica nada: la versión no existe hasta publicarse.
        return fail("TECHNICAL_FAILURE", true);
      }
    },
  };
}

const pick = (r: { versionId: string; versionNumber: number; manifestHash: string }) => ({
  versionId: r.versionId, versionNumber: r.versionNumber, manifestHash: r.manifestHash,
});
