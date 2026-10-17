import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Message } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";
import type { ContrastInputRef, ContrastStore } from "@/lib/documents/contrast/ports";
import type { ExtractionReader } from "@/lib/documents/drafting/ports";
import type { SessionPort } from "@/lib/documents/ports";
import type { ServiceResult } from "@/lib/documents/result";

import { CONTRAST_INSTRUCTIONS_V1, CONTRAST_PROMPT_VERSION } from "../prompts/contrast/v1";

import type { GroqStructuredPort, GroqTextSource } from "./structured";

/**
 * Agente 2 · contraste textual con Groq, sin veto (MVP-053; REQ-06, INV-02/07/10).
 *
 * Recibe los mensajes originales, los textos extraídos y el borrador (no solo
 * un resumen), con refs exactas. El resultado es uno de los tres valores del
 * PRD §3.5 y es **informativo**: el reporte no tiene ningún campo de bloqueo
 * ni cambia otras dimensiones. Un fallo no fabrica reporte.
 */

export const TEXT_ONLY_LIMITATION =
  "Contraste textual: la ausencia de hallazgos no prueba que los hechos sean verdaderos.";
export const VISUAL_LIMITATION =
  "Hay texto extraído por Gemini de PDF o imágenes: Groq no aporta verificación visual independiente.";

/**
 * Límites que `persist_contrast_report` (02502) aplica a la salida del modelo. Se validan aquí antes de
 * persistir: una salida que los excede es técnicamente inválida y no se trunca ni se descarta en silencio.
 * (Las limitaciones son constantes internas; no vienen del modelo.) No van en el JSON Schema enviado a Groq.
 */
export const CONTRAST_STORAGE_LIMITS = { maxFindings: 200, maxMessageChars: 4000, maxSourceRefs: 401, maxInputs: 401 } as const;

const Ref = z.string().regex(/^(?:m|e|b)\d{1,3}$/);

export const ContrastOutputSchema = z.strictObject({
  result: z.enum(["sin_inconsistencias_criticas_detectadas", "con_advertencias", "contradiccion_critica"]),
  findings: z.array(
    z.strictObject({
      message: z.string().min(1),
      severity: z.enum(["warning", "critical"]),
      sourceRefs: z.array(Ref).min(1),
    }),
  ),
});

export type ContrastOutput = z.infer<typeof ContrastOutputSchema>;

/** Resultado coherente con los hallazgos (determinista). */
export function expectedResult(findings: ContrastOutput["findings"]): ContrastOutput["result"] {
  if (findings.some((f) => f.severity === "critical")) return "contradiccion_critica";
  return findings.length > 0 ? "con_advertencias" : "sin_inconsistencias_criticas_detectadas";
}

export type ContrastReport = ContrastOutput & {
  reportId: string;
  createdAt: string;
  draftId: string;
  draftRevision: number;
  modelId: string;
  promptVersion: string;
  inputs: ContrastInputRef[];
  limitations: string[];
};

export type ContrastDeps = {
  session: SessionPort;
  messages: { listMessages(documentId: string): Promise<ServiceResult<Message[]>> };
  store: ContrastStore;
  groq: GroqStructuredPort;
  extractions?: ExtractionReader;
};

function fail(code: string, stage: TechnicalError["stage"], retryable: boolean, correlationId: string) {
  return { ok: false as const, error: { code, stage, retryable, correlationId } };
}

export function createContrastService(deps: ContrastDeps) {
  return {
    async contrastDraft(command: {
      documentId: string;
      abortSignal?: AbortSignal;
      correlationId?: string;
    }): Promise<ServiceResult<ContrastReport>> {
      const correlationId = command.correlationId ?? randomUUID();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return fail("NO_SESSION", "autenticacion", false, correlationId);

      // Lecturas del propietario: documento ajeno o inexistente no llega al proveedor.
      const listed = await deps.messages.listMessages(command.documentId);
      if (!listed.ok) return listed;
      let draft;
      let extractions: Awaited<ReturnType<ExtractionReader["listExtractions"]>> = [];
      try {
        draft = await deps.store.getCurrentDraft(ownerId, command.documentId);
        if (deps.extractions) extractions = await deps.extractions.listExtractions(ownerId, command.documentId);
      } catch {
        return fail("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
      if (!draft) return fail("NO_DRAFT", "validacion", false, correlationId);

      const inputs: ContrastInputRef[] = [];
      const sources: GroqTextSource[] = [];
      const add = (ref: string, kind: ContrastInputRef["kind"], id: string, text: string) => {
        inputs.push({ ref, kind, id });
        sources.push({ id: ref, text });
      };
      listed.value.forEach((m, i) => add(`m${i + 1}`, "mensaje", m.messageId, m.content));
      extractions.forEach((x, i) =>
        add(`e${i + 1}`, "extraccion", x.extractionId, `[texto extraído por Gemini de ${x.origin === "pdf" ? "un PDF" : "una imagen"}]\n${x.text}`),
      );
      add("b1", "borrador", draft.draftId, `${draft.content.title}\n\n${draft.content.body}`);

      // `p_inputs` de la RPC admite como máximo 401 entradas (incluye b1). Se rechaza sin truncar ni omitir fuentes.
      if (inputs.length > CONTRAST_STORAGE_LIMITS.maxInputs) return fail("INPUT_TOO_LARGE", "validacion", false, correlationId);

      const generated = await deps.groq.generateStructured({
        instructions: CONTRAST_INSTRUCTIONS_V1,
        sources,
        schema: ContrastOutputSchema,
        schemaName: "contrast_report",
        abortSignal: command.abortSignal,
        correlationId,
      });
      if (!generated.ok) return { ok: false, error: generated.error };

      const output = generated.output;
      const sent = new Set(inputs.map((i) => i.ref));
      const refsValid = output.findings.every((f) => f.sourceRefs.every((r) => sent.has(r)));
      const withinLimits =
        output.findings.length <= CONTRAST_STORAGE_LIMITS.maxFindings &&
        output.findings.every(
          (f) => f.message.length <= CONTRAST_STORAGE_LIMITS.maxMessageChars && f.sourceRefs.length <= CONTRAST_STORAGE_LIMITS.maxSourceRefs,
        );
      if (!refsValid || !withinLimits || output.result !== expectedResult(output.findings)) {
        // Referencia inventada, resultado incoherente o fuera de los límites de almacenamiento: error técnico, sin reporte.
        return fail("AI_INVALID_OUTPUT", "ia", true, correlationId);
      }

      const limitations = [TEXT_ONLY_LIMITATION, ...(extractions.length > 0 ? [VISUAL_LIMITATION] : [])];
      try {
        const saved = await deps.store.saveReport({
          ownerId,
          documentId: command.documentId,
          draftId: draft.draftId,
          draftRevision: draft.draftRevision,
          result: output.result,
          findings: output.findings,
          inputs,
          modelId: generated.modelId,
          promptVersion: CONTRAST_PROMPT_VERSION,
          limitations,
        });
        return {
          ok: true,
          value: {
            ...output,
            ...saved,
            draftId: draft.draftId,
            draftRevision: draft.draftRevision,
            modelId: generated.modelId,
            promptVersion: CONTRAST_PROMPT_VERSION,
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
