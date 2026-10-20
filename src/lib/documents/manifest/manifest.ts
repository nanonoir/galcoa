import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { FrozenContentSchema } from "@/lib/contracts/review";

import { canonicalHash, sha256Hex } from "./jcs";

/**
 * Cadena de hashes del manifiesto (MVP-082; manifest-hcs §1–2, INV-05/06).
 *
 *   contenido congelado ── JCS/SHA-256 ── snapshotHash
 *   detalle privado + nonce ── JCS/SHA-256 ── privateDetailHash
 *   envelope {schemaVersion, reference, pdfHash, privateDetailHash} ── manifestHash
 *
 * Solo el envelope es público (y el payload HCS que lleva su hash). El detalle
 * y el nonce son privados. Cada preimage se valida con un esquema estricto:
 * un campo de más o de menos no se hashea.
 */

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

export const MANIFEST_SCHEMA_VERSION = "galcoa.manifest.v1";
export const PRIVATE_DETAIL_SCHEMA_VERSION = "galcoa.private-detail.v1";
export const PRIVATE_DETAIL_SCHEMA_VERSION_V2 = "galcoa.private-detail.v2";

export const ReferenceSchema = z.string().regex(/^[0-9a-f]{32}$/);
export const NonceSchema = z.string().regex(/^[0-9a-f]{64}$/);

const RoleSchema = z.enum(["autor", "intermediario", "comprador"]);
const ROLE_ORDER = RoleSchema.options;

const detailShape = {
    versionId: z.string().min(1),
    revisionId: z.string().min(1),
    snapshotId: z.string().min(1),
    snapshotHash: Sha256,
    evidences: z.array(z.strictObject({ evidenceId: z.string().min(1), sha256: Sha256 })),
    reports: z.array(
      z.strictObject({
        reportId: z.string().min(1),
        sha256: Sha256,
        sources: z.array(
          z.strictObject({
            type: z.enum(["message", "evidence", "extraction"]),
            id: z.string().min(1),
            page: z.number().int().positive().nullable(),
            region: z.string().min(1).nullable(),
          }),
        ),
      }),
    ),
    confirmations: z.array(
      z.strictObject({
        responseId: z.string().min(1),
        role: RoleSchema,
        snapshotHash: Sha256,
        decision: z.enum(["confirmar", "rechazar"]),
        checkbox: z.boolean(),
        declaredName: z.string().min(1).nullable(),
        ratifiedRejection: z.boolean(),
        respondedAt: Instant,
      }),
    ),
    previousVersion: z.strictObject({ versionId: z.string().min(1), manifestHash: Sha256 }).nullable(),
    nonce: NonceSchema,
};

type DetailCheck = {
  snapshotHash: string;
  confirmations: { role: z.infer<typeof RoleSchema>; snapshotHash: string; declaredName: string | null }[];
  evidences: { evidenceId: string }[];
  reports: { reportId: string }[];
};

const refineDetail = (d: DetailCheck, ctx: z.RefinementCtx) => {
    const roles = d.confirmations.map((c) => c.role);
    const sorted = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    if (new Set(roles).size !== roles.length) ctx.addIssue({ code: "custom", message: "Constancias duplicadas por rol" });
    if (roles.join() !== sorted.join()) ctx.addIssue({ code: "custom", message: "Constancias fuera del orden autor, intermediario, comprador" });
    for (const c of d.confirmations) {
      if (c.snapshotHash !== d.snapshotHash) ctx.addIssue({ code: "custom", message: "Constancia de otro snapshot" });
      if (c.role !== "autor" && c.declaredName === null) ctx.addIssue({ code: "custom", message: "Un tercero declara su nombre" });
    }
    const ids = (xs: { evidenceId?: string; reportId?: string }[], k: "evidenceId" | "reportId") => xs.map((x) => x[k]!);
    for (const [list, key] of [[ids(d.evidences, "evidenceId"), "evidencias"], [ids(d.reports, "reportId"), "reportes"]] as const) {
      const sortedIds = [...list].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (list.join("\u0000") !== sortedIds.join("\u0000")) ctx.addIssue({ code: "custom", message: `${key} fuera de orden por ID` });
    }

  };

export const PrivateDetailV1Schema = z
  .strictObject({ schemaVersion: z.literal(PRIVATE_DETAIL_SCHEMA_VERSION), ...detailShape })
  .superRefine(refineDetail);

/** v2: agrega el compromiso a la evaluación ALC de la revisión (id, versión de reglas, color y huella del insumo). */
export const PrivateDetailV2Schema = z
  .strictObject({
    schemaVersion: z.literal(PRIVATE_DETAIL_SCHEMA_VERSION_V2),
    ...detailShape,
    alc: z.strictObject({ evaluationId: z.string().min(1), rulesVersion: z.string().min(1), color: z.enum(["verde", "amarillo", "rojo"]), inputHash: Sha256 }),
  })
  .superRefine(refineDetail);

/** Lector explícito v1/v2: el detalle de una versión ya sellada no se reinterpreta. */
export const PrivateDetailSchema = z.union([PrivateDetailV1Schema, PrivateDetailV2Schema]);
export const EnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  reference: ReferenceSchema,
  pdfHash: Sha256,
  privateDetailHash: Sha256,
});

export type PrivateDetail = z.infer<typeof PrivateDetailSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;

/** Hash del contenido congelado (preimage `content` de `FrozenOperationSchema`). */
export function snapshotHash(content: unknown): { bytes: Uint8Array; hash: string } {
  return canonicalHash(FrozenContentSchema.parse(content));
}

/** SHA-256 de los **bytes** del PDF persistido, nunca de su texto. */
export function pdfHash(pdfBytes: Uint8Array): string {
  return sha256Hex(pdfBytes);
}

export function privateDetailHash(detail: unknown): { bytes: Uint8Array; hash: string } {
  return canonicalHash(PrivateDetailSchema.parse(detail));
}

export function buildEnvelope(input: { reference: string; pdfHash: string; privateDetailHash: string }): {
  envelope: Envelope;
  bytes: Uint8Array;
  manifestHash: string;
} {
  const envelope = EnvelopeSchema.parse({ schemaVersion: MANIFEST_SCHEMA_VERSION, ...input });
  const { bytes, hash } = canonicalHash(envelope);
  return { envelope, bytes, manifestHash: hash };
}

/** Nonce privado: 32 bytes CSPRNG en 64 hex. Se genera **una vez** en la reserva durable. */
export const generateNonce = () => randomBytes(32).toString("hex");
/** Referencia pública opaca: 16 bytes CSPRNG en 32 hex; no deriva de datos ni autoriza acceso. */
export const generateReference = () => randomBytes(16).toString("hex");
