import { z } from "zod";

import { IdSchema, InstantSchema, SchemaVersionSchema, Sha256HexSchema } from "./common";
import { HcsStatusSchema } from "./document";
import { HcsConsensusSchema } from "./version";
import {
  FrozenOperationSchema,
  ParticipantSelectionSchema,
  SharedWarningSchema,
  ThirdPartyRoleSchema,
} from "./review";

/**
 * DTO públicos mínimos (MVP-021; INV-12, INV-15; SH-02). Son esquemas propios y
 * estrictos, construidos por allowlist: nunca un registro privado recortado con
 * spread/omit. No contienen chat, evidencias, tokens ni ids privados.
 */

export const InvitationAvailabilitySchema = z.enum([
  "disponible",
  "ya_respondida",
  "caducada",
  "revocada",
  "sustituida",
]);

/** Invitación que ve el tercero: operación completa idéntica a la del autor (REQ-13). */
export const PublicInvitationSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  /** Identificadores opacos; no son capacidades de acceso. */
  revisionId: IdSchema,
  snapshotId: IdSchema,
  snapshotHash: Sha256HexSchema,
  /** Rol del invitado en esta revisión. */
  role: ThirdPartyRoleSchema,
  /** Selección completa por roles, sin nombres ni correos. */
  selection: ParticipantSelectionSchema,
  operation: FrozenOperationSchema.shape.operation,
  /** Advertencias completas con alias locales («Fuente A»). */
  warnings: z.array(SharedWarningSchema),
  availability: InvitationAvailabilitySchema,
  expiresAt: InstantSchema,
});

/** Envelope público del manifiesto: compromiso al PDF y al detalle privado, sin revelarlo (SH-06). */
export const PublicManifestEnvelopeSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  publicReference: IdSchema,
  pdfHash: Sha256HexSchema,
  privateDetailHash: Sha256HexSchema,
});

export const PublicProofSchema = z.strictObject({
  envelope: PublicManifestEnvelopeSchema,
  manifestHash: Sha256HexSchema,
  consensus: HcsConsensusSchema,
});

/** Resultado sobre un PDF aportado: `no_verificable` si falta algún eslabón (nunca éxito por omisión). */
export const PublicFileCheckSchema = z.discriminatedUnion("provided", [
  z.strictObject({ provided: z.literal(false) }),
  z.strictObject({
    provided: z.literal(true),
    result: z.enum(["coincide", "no_coincide", "no_verificable"]),
  }),
]);

export const PublicVerificationSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    publicReference: IdSchema,
    registrationStatus: HcsStatusSchema,
    /** Prueba no sensible; `null` mientras no haya registro comprobado. */
    proof: PublicProofSchema.nullable(),
    fileCheck: PublicFileCheckSchema,
  })
  .refine((v) => v.proof === null || v.registrationStatus === "registrado", {
    message: "Solo un registro comprobado expone prueba",
    path: ["proof"],
  })
  .refine((v) => !v.fileCheck.provided || v.fileCheck.result === "no_verificable" || v.proof !== null, {
    message: "Sin prueba el archivo no puede declararse coincidente ni distinto",
    path: ["fileCheck"],
  });

export type InvitationAvailability = z.infer<typeof InvitationAvailabilitySchema>;
export type PublicInvitation = z.infer<typeof PublicInvitationSchema>;
export type PublicManifestEnvelope = z.infer<typeof PublicManifestEnvelopeSchema>;
export type PublicProof = z.infer<typeof PublicProofSchema>;
export type PublicVerification = z.infer<typeof PublicVerificationSchema>;
