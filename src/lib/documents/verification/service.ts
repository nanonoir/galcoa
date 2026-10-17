import "server-only";

import { PublicVerificationSchema, type PublicVerification } from "@/lib/contracts/public";
import type { HcsStatus } from "@/lib/contracts/document";
import type { createMirrorReader } from "@/lib/hedera/mirror";

import { buildEnvelope, pdfHash, ReferenceSchema } from "../manifest/manifest";

/**
 * Verificador público de integridad (MVP-100; manifest-hcs §5, INV-15, SH-02).
 *
 * Cadena: PDF aportado → pdfHash → envelope JCS → manifestHash → mensaje HCS
 * recuperado de Mirror (topic, red, secuencia, transacción). Solo si **todos**
 * los eslabones coinciden hay prueba. Faltantes, pendientes, Mirror caído o
 * reinicio de red dan «no verificable», nunca éxito ni acusación. No reintenta
 * envíos ni modifica el sello. El PDF se procesa en memoria: no se persiste,
 * no se publica y no sale hacia Hedera, IA ni Mirror.
 *
 * El DTO es el contrato `PublicVerificationSchema` (allowlist estricta): sin
 * operación, chat, evidencias, constancias, participantes, PK ni nonce. Por
 * ese contrato, sin prueba registrada un archivo no puede declararse
 * coincidente **ni distinto**: queda «no verificable».
 */

export const MAX_VERIFY_PDF_BYTES = 10 * 1_048_576;

/** Proyección pública restringida que devuelve la función de permisos mínimos (MVP-083/091). */
export type PublicRecord = {
  reference: string;
  envelope: { pdfHash: string; privateDetailHash: string };
  /** `manifestHash` persistido al publicar la versión. */
  manifestHash: string;
  hcsStatus: HcsStatus;
  /** Localizadores del registro comprobado; `null` si no hay. */
  registration: {
    network: "testnet";
    topicId: string;
    sequenceNumber: string;
    transactionId: string;
    epochStartedAt?: string;
  } | null;
};

export type PublicVerificationStore = {
  /** `null` si la referencia no existe o no es pública. */
  getByReference(reference: string): Promise<PublicRecord | null>;
};

export class VerificationInputError extends Error {
  constructor(readonly code: "VERIFY_FILE_TOO_LARGE" | "VERIFY_NOT_A_PDF") {
    super(code === "VERIFY_FILE_TOO_LARGE" ? "El archivo supera el tamaño admitido." : "El archivo no es un PDF.");
    this.name = "VerificationInputError";
  }
}

const consensusToInstant = (ts: string) => {
  const [secs, nanos = "0"] = ts.split(".");
  return new Date(Number(secs) * 1000 + Math.floor(Number(nanos.padEnd(9, "0")) / 1e6)).toISOString();
};

/** Respuesta para referencias inexistentes o inválidas: sin datos del registro. */
function notVerifiable(reference: string, provided: boolean): PublicVerification {
  return PublicVerificationSchema.parse({
    schemaVersion: 1,
    publicReference: reference || "desconocida",
    registrationStatus: "no_iniciado",
    proof: null,
    fileCheck: provided ? { provided: true, result: "no_verificable" } : { provided: false },
  });
}

export function createVerificationService(deps: { store: PublicVerificationStore; mirror: ReturnType<typeof createMirrorReader> }) {
  return {
    async verify(reference: string, pdf?: Uint8Array): Promise<PublicVerification> {
      const provided = pdf !== undefined;
      if (provided) {
        if (pdf.byteLength > MAX_VERIFY_PDF_BYTES) throw new VerificationInputError("VERIFY_FILE_TOO_LARGE");
        if (Buffer.from(pdf.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new VerificationInputError("VERIFY_NOT_A_PDF");
      }
      if (!ReferenceSchema.safeParse(reference).success) return notVerifiable("desconocida", provided);

      const record = await deps.store.getByReference(reference);
      if (!record) return notVerifiable(reference, provided);

      // El envelope persistido tiene que reproducir el manifestHash persistido.
      let envelopeOk = false;
      try {
        envelopeOk =
          buildEnvelope({ reference, pdfHash: record.envelope.pdfHash, privateDetailHash: record.envelope.privateDetailHash }).manifestHash ===
          record.manifestHash;
      } catch {
        envelopeOk = false;
      }

      let proof: PublicVerification["proof"] = null;
      if (envelopeOk && record.hcsStatus === "registrado" && record.registration?.network === "testnet") {
        const check = await deps.mirror.checkMessage({
          topicId: record.registration.topicId,
          sequenceNumber: record.registration.sequenceNumber,
          transactionId: record.registration.transactionId,
          reference,
          manifestHash: record.manifestHash,
          epochStartedAt: record.registration.epochStartedAt,
        });
        if (check.result === "coincide") {
          proof = {
            envelope: { schemaVersion: 1, publicReference: reference, pdfHash: record.envelope.pdfHash, privateDetailHash: record.envelope.privateDetailHash },
            manifestHash: record.manifestHash,
            consensus: {
              topicId: check.topicId,
              network: "testnet",
              sequenceNumber: Number(check.sequenceNumber),
              consensusTimestamp: consensusToInstant(check.consensusTimestamp),
            },
          };
        }
      }

      const fileCheck: PublicVerification["fileCheck"] = !provided
        ? { provided: false }
        : { provided: true, result: proof === null ? "no_verificable" : pdfHash(pdf) === record.envelope.pdfHash ? "coincide" : "no_coincide" };

      return PublicVerificationSchema.parse({
        schemaVersion: 1,
        publicReference: reference,
        // Sin prueba vigente no se muestra «registrado», aunque la base lo diga.
        registrationStatus: proof ? "registrado" : record.hcsStatus === "registrado" ? "pendiente" : record.hcsStatus,
        proof,
        fileCheck,
      });
    },
  };
}
