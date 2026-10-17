/**
 * Vista de la última versión publicada de un documento con su sello (INV-06): solo identificadores
 * públicos y hashes. Sin bytes firmados, claves ni payload. La arma el servidor; la presentación
 * solo la lee.
 */

export type SealedVersionSeal =
  /** Registro probado en Hedera Testnet; `consensusTimestamp` es `segundos.nanos` exacto. */
  | { status: "registrado"; topicId: string; sequenceNumber: string; transactionId: string; consensusTimestamp: string }
  /** Todavía sin registro probado: la versión ya está publicada. */
  | { status: "no_iniciado" | "pendiente" | "fallido" };

export interface SealedVersionView {
  documentId: string;
  /** Revisión finalizada: el reintento del registro reutiliza su endpoint de finalización (idempotente). */
  revisionId: string;
  versionNumber: number;
  /** Referencia pública de verificación (`/verify/<reference>`). */
  reference: string;
  /** Hash del documento (manifiesto de la versión), SHA-256 hex. */
  documentHash: string;
  /** ISO 8601. */
  finalizedAt: string;
  seal: SealedVersionSeal;
}
