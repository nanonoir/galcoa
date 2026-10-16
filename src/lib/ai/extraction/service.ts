import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";
import type { ExtractionReader } from "@/lib/documents/drafting/ports";
import { EVIDENCE_LIMITS } from "@/lib/documents/evidence/inspect";
import type { EvidenceStorage, EvidenceStore, StoredEvidence, StoredExtraction } from "@/lib/documents/evidence/ports";
import type { SessionPort } from "@/lib/documents/ports";
import type { ServiceResult } from "@/lib/documents/result";

import type { GeminiStructuredPort } from "../gemini/structured";

import { EXTRACTION_INSTRUCTIONS_V1, EXTRACTION_PROMPT_VERSION } from "./prompt-v1";

/**
 * Extracción de texto de evidencias con procedencia (MVP-043; REQ-04, INV-07;
 * sources-and-ai §7.5).
 *
 * Lee el original del Storage privado **en el servidor**, comprueba que su
 * hash siga siendo el aceptado y lo envía al puerto Gemini de MVP-050 como
 * dato no confiable, inline: cada archivo mide como mucho 10 MiB, así que la
 * solicitud completa cabe en el límite inline de 20 MB y no hay archivo remoto
 * temporal que limpiar. Nunca se envían URLs al modelo. La extracción se
 * guarda aparte, con método, modelo, prompt, páginas y limitaciones; cada
 * reintento crea otra fila. Un fallo no crea extracción ni texto de relleno.
 */

export const VISUAL_LEGEND = "Interpretada por Gemini; sin verificación visual independiente.";

/** Estimación conservadora de tokens por archivo (Gemini: ~258 por página o imagen en baja resolución). */
const ESTIMATED_TOKENS = { pdf: 258 * EVIDENCE_LIMITS.maxPdfPages, imagen: 1_290 } as const;

export const ExtractionOutputSchema = z.strictObject({
  text: z.string(),
  pages: z.array(z.number().int().positive()),
  limitations: z.array(z.string().min(1)),
});

export type ExtractionDeps = {
  session: SessionPort;
  store: EvidenceStore;
  storage: EvidenceStorage;
  gemini: GeminiStructuredPort;
};

function fail(code: string, stage: TechnicalError["stage"], retryable: boolean, correlationId: string) {
  return { ok: false as const, error: { code, stage, retryable, correlationId } };
}

export function createExtractionService(deps: ExtractionDeps) {
  return {
    async extractEvidence(command: {
      documentId: string;
      evidenceId: string;
      abortSignal?: AbortSignal;
      correlationId?: string;
    }): Promise<ServiceResult<StoredExtraction>> {
      const correlationId = command.correlationId ?? randomUUID();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return fail("NO_SESSION", "autenticacion", false, correlationId);

      let evidence: StoredEvidence | null;
      let bytes: Uint8Array | null;
      try {
        evidence = await deps.store.getEvidence(ownerId, command.documentId, command.evidenceId);
        if (!evidence || evidence.uploadState !== "accepted") return fail("NOT_AVAILABLE", "persistencia", false, correlationId);
        bytes = await deps.storage.download(evidence.privateLocation);
      } catch {
        return fail("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
      // El original aceptado tiene que estar intacto: si no, no se extrae nada.
      if (!bytes || createHash("sha256").update(bytes).digest("hex") !== evidence.sha256) {
        return fail("EVIDENCE_ORIGINAL_UNAVAILABLE", "persistencia", false, correlationId);
      }

      let extraction: Omit<StoredExtraction, "extractionId" | "extractedAt" | "documentId" | "evidenceId">;
      if (evidence.kind === "texto") {
        // Texto directo: decodificación determinista, sin IA.
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        extraction = { method: "directo", model: null, promptVersion: null, pages: null, text, limitations: [] };
      } else {
        const generated = await deps.gemini.generateStructured({
          instructions: EXTRACTION_INSTRUCTIONS_V1,
          sources: [
            {
              kind: "file",
              id: "e1",
              mediaType: evidence.mimeType as "application/pdf" | "image/jpeg" | "image/png",
              data: bytes,
              estimatedTokens: ESTIMATED_TOKENS[evidence.kind],
            },
          ],
          schema: ExtractionOutputSchema,
          abortSignal: command.abortSignal,
          correlationId,
        });
        if (!generated.ok) return { ok: false, error: generated.error };
        const out = generated.output;
        extraction = {
          method: "gemini",
          model: generated.modelId,
          promptVersion: EXTRACTION_PROMPT_VERSION,
          pages: out.pages.length > 0 ? [...new Set(out.pages)].sort((a, b) => a - b) : null,
          text: out.text,
          limitations: [...out.limitations, VISUAL_LEGEND],
        };
      }

      try {
        const saved = await deps.store.appendExtraction({
          ...extraction,
          ownerId,
          documentId: command.documentId,
          evidenceId: evidence.evidenceId,
          audit: { actorScope: ownerId, correlationId },
        });
        return { ok: true, value: saved };
      } catch {
        return fail("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}

/**
 * Puerto de lectura para MVP-051/053/061: la extracción más reciente de cada
 * original aceptado, en el orden de carga. El texto lleva su origen (PDF o
 * imagen) para que los agentes declaren la falta de verificación visual.
 */
export function createExtractionReader(store: EvidenceStore): ExtractionReader {
  return {
    async listExtractions(ownerId, documentId) {
      const [evidences, extractions] = await Promise.all([
        store.listEvidences(ownerId, documentId),
        store.listExtractions(ownerId, documentId),
      ]);
      if (!evidences || !extractions) return [];
      return evidences
        .filter((e): e is StoredEvidence & { kind: "pdf" | "imagen" } => e.uploadState === "accepted" && e.kind !== "texto")
        .flatMap((e) => {
          const latest = extractions
            .filter((x) => x.evidenceId === e.evidenceId)
            .sort((a, b) => (a.extractedAt < b.extractedAt ? -1 : a.extractedAt > b.extractedAt ? 1 : 0))
            .at(-1);
          return latest ? [{ extractionId: latest.extractionId, origin: e.kind, text: latest.text }] : [];
        });
    },
  };
}
