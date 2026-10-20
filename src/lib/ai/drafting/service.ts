import "server-only";

import { randomUUID } from "node:crypto";

import type { Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";
import type { DraftInputRef, DraftStager, ExtractionReader, StagedRef } from "@/lib/documents/drafting/ports";
import type { SessionPort } from "@/lib/documents/ports";
import type { ServiceResult } from "@/lib/documents/result";
import type { TurnClaimRef } from "@/lib/documents/turns/ports";

import type { GeminiStructuredPort, GeminiTextSource } from "../gemini/structured";
import { DRAFTING_INSTRUCTIONS_V2, DRAFTING_PROMPT_VERSION } from "../prompts/drafting/v2";

import { checkProvenance } from "./provenance";
import { sanitizeDraftOutput } from "./sanitize";
import { DraftOutputSchema, type DraftOutput } from "./schema";

/**
 * Agente 1 · redacción autónoma con procedencia (MVP-051; REQ-05, INV-07/10).
 *
 * Lee los mensajes originales con el servicio de MVP-041 (y extracciones si
 * hay lector), los envía como datos no confiables al puerto Gemini (MVP-050),
 * verifica la procedencia de forma determinista y guarda una propuesta nueva
 * en staging (ligada al intento) con modelo, versión de prompt, entradas exactas y
 * limitaciones; no publica borrador oficial: eso lo hace completar el turno. No pregunta
 * ni bloquea por datos faltantes; no modifica mensajes. Un fallo no crea
 * borrador ni éxito ficticio. El turno de chat y el streaming son de MVP-052.
 */

export const VISUAL_LIMITATION =
  "El texto de PDF o imágenes lo extrajo Gemini: no hay verificación visual independiente.";

export type DraftingDeps = {
  session: SessionPort;
  messages: { listMessages(documentId: string): Promise<ServiceResult<Message[]>> };
  stager: DraftStager;
  gemini: GeminiStructuredPort;
  /** Opcional hasta que exista MVP-043. */
  extractions?: ExtractionReader;
};

export type GenerateDraftCommand = {
  documentId: string;
  expectedDraftRevision: number;
  /** Intento reclamado al que queda ligado el staging (fencing explícito). */
  claim: TurnClaimRef;
  abortSignal?: AbortSignal;
  correlationId?: string;
};

export type GeneratedDraft = {
  /** Referencias de staging: aún no hay borrador oficial. */
  staged: StagedRef;
  proposal: DraftOutput;
  modelId: string;
  promptVersion: string;
  inputs: DraftInputRef[];
  limitations: string[];
};

function fail(code: string, stage: TechnicalError["stage"], retryable: boolean, correlationId: string) {
  return { ok: false as const, error: { code, stage, retryable, correlationId } };
}

function describeDate(m: Message): string {
  return m.declaredEventDate.kind === "unknown"
    ? "fecha del hecho no informada"
    : `fecha declarada: ${m.declaredEventDate.originalText}`;
}

export function createDraftingService(deps: DraftingDeps) {
  return {
    async generateDraft(command: GenerateDraftCommand): Promise<ServiceResult<GeneratedDraft>> {
      const correlationId = command.correlationId ?? randomUUID();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return fail("NO_SESSION", "autenticacion", false, correlationId);
      if (!Number.isInteger(command.expectedDraftRevision) || command.expectedDraftRevision < 0) {
        return fail("INVALID_INPUT", "validacion", false, correlationId);
      }

      const listed = await deps.messages.listMessages(command.documentId);
      if (!listed.ok) return listed;
      if (listed.value.length === 0) return fail("NO_SOURCES", "validacion", false, correlationId);

      // Refs cortas y estables por orden de secuencia; el texto original no se altera.
      const inputs: DraftInputRef[] = [];
      const sources: GeminiTextSource[] = [];
      const texts = new Map<string, string>();
      listed.value.forEach((m, i) => {
        const ref = `m${i + 1}`;
        const text = `[${m.sender === "autor" ? "mensaje del autor" : "mensaje del agente"}; ${describeDate(m)}]\n${m.content}`;
        inputs.push({ ref, kind: "mensaje", id: m.messageId });
        sources.push({ kind: "text", id: ref, text });
        texts.set(ref, text);
      });

      const limitations: string[] = [];
      if (deps.extractions) {
        let extractions;
        try {
          extractions = await deps.extractions.listExtractions(ownerId, command.documentId);
        } catch {
          return fail("TECHNICAL_FAILURE", "persistencia", true, correlationId);
        }
        extractions.forEach((x, i) => {
          const ref = `e${i + 1}`;
          const text = `[texto extraído de ${x.origin === "pdf" ? "un PDF" : "una imagen"}]\n${x.text}`;
          inputs.push({ ref, kind: "extraccion", id: x.extractionId });
          sources.push({ kind: "text", id: ref, text });
          texts.set(ref, text);
        });
        if (extractions.length > 0) limitations.push(VISUAL_LIMITATION);
      }

      const generated = await deps.gemini.generateStructured({
        instructions: DRAFTING_INSTRUCTIONS_V2,
        sources,
        schema: DraftOutputSchema,
        abortSignal: command.abortSignal,
        correlationId,
      });
      if (!generated.ok) return { ok: false, error: generated.error };

      const provenance = checkProvenance(generated.output, texts);
      if (!provenance.ok) {
        // Fuente inventada o corrección no inocua: error técnico reintentable, sin borrador.
        return fail("AI_INVALID_PROVENANCE", "ia", true, correlationId);
      }
      const sanitized = sanitizeDraftOutput(generated.output, texts);
      limitations.push(...sanitized.notes);
      const proposal: DraftOutput = {
        ...sanitized.output,
        warnings: [...generated.output.warnings, ...provenance.addedWarnings],
      };

      try {
        const staged = await deps.stager.stageProposal({
          claim: command.claim,
          audit: { actorScope: ownerId, correlationId },
          ownerId,
          documentId: command.documentId,
          expectedDraftRevision: command.expectedDraftRevision,
          content: {
            title: proposal.title,
            body: proposal.body,
            corrections: proposal.corrections.map((c) => `${c.original} → ${c.corrected} (${c.sourceRef})`),
          },
          proposal,
          inputs,
          modelId: generated.modelId,
          promptVersion: DRAFTING_PROMPT_VERSION,
          limitations,
        });
        if (staged.status === "stale") return fail("TURN_SUPERSEDED", "ia", false, correlationId);
        if (staged.status === "stale_draft") return fail("STALE_DRAFT", "persistencia", false, correlationId);
        if (staged.status === "not_available") return fail("NOT_AVAILABLE", "persistencia", false, correlationId);
        if (staged.status !== "staged") return fail("TECHNICAL_FAILURE", "persistencia", staged.status === "user_message_required", correlationId);
        return {
          ok: true,
          value: {
            staged: staged.staged,
            proposal,
            modelId: generated.modelId,
            promptVersion: DRAFTING_PROMPT_VERSION,
            inputs,
            limitations,
          },
        };
      } catch {
        return fail("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
