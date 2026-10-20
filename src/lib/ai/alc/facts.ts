import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { ALC_TECHNICAL, type AlcClaim, type AlcSource, type AlcTechnical } from "@/lib/contracts/alc";
import type { TechnicalError } from "@/lib/contracts/technical";

import type { GroqStructuredPort } from "../groq/structured";
import { ALC_FACTS_INSTRUCTIONS_V1 } from "../prompts/alc/v1";

/**
 * Lector de hechos del ALC con Groq (F-1). La IA propone afirmaciones con cita; el servidor localiza cada cita en el
 * texto real de su fuente y valida que el valor figure en ella. Una salida inválida es un impedimento técnico (nunca un
 * rojo). El color no sale de aquí: lo calcula `evaluateAlc`.
 */

export const DRAFT_SOURCE_ID = "b1";

const FactsOutputSchema = z.strictObject({
  contentCoverageComplete: z.boolean(),
  claims: z.array(
    z.strictObject({
      subject: z.string().min(1),
      field: z.string().min(1),
      value: z.string().min(1),
      unit: z.string(),
      numeric: z.boolean(),
      ambiguous: z.boolean(),
      assertions: z.array(
        z.strictObject({ sourceId: z.string().min(1), quote: z.string().min(1), value: z.string().min(1), unit: z.string() }),
      ),
    }),
  ),
});

export type AlcFacts = { claims: AlcClaim[]; contentCoverageComplete: boolean };

export type AlcFactsResult =
  | { ok: true; facts: AlcFacts }
  | { ok: false; error: TechnicalError }
  | { ok: false; technical: AlcTechnical };

const NUMBER_TOKEN = /-?\d+(?:[.,]\d+)*/g;

/** Identidad estable de la afirmación: depende solo de sujeto y campo, no del azar del modelo. */
export function claimId(subject: string, field: string): string {
  return `c_${createHash("sha256").update(JSON.stringify([subject.trim(), field.trim()]), "utf8").digest("hex").slice(0, 16)}`;
}

export function createAlcFactsReader(deps: { groq: GroqStructuredPort }) {
  return {
    async readFacts(input: {
      draft: { title: string; body: string };
      sources: readonly AlcSource[];
      correlationId: string;
      abortSignal?: AbortSignal;
    }): Promise<AlcFactsResult> {
      const readable = input.sources.filter((s) => s.reading === "legible");
      const body = `${input.draft.title}\n\n${input.draft.body}`;
      const generated = await deps.groq.generateStructured({
        instructions: ALC_FACTS_INSTRUCTIONS_V1,
        sources: [{ id: DRAFT_SOURCE_ID, text: body }, ...readable.map((s) => ({ id: s.id, text: s.text }))],
        schema: FactsOutputSchema,
        schemaName: "alc_facts",
        abortSignal: input.abortSignal,
        correlationId: input.correlationId,
      });
      if (!generated.ok) return { ok: false, error: generated.error };

      const byId = new Map(readable.map((s) => [s.id, s]));
      const claims: AlcClaim[] = [];
      const bodyTokens: string[] = body.match(NUMBER_TOKEN) ?? [];
      const claimTokens = new Set<string>();
      for (const raw of generated.output.claims) {
        const subject = raw.subject.trim();
        const field = raw.field.trim();
        const value = raw.value.trim();
        // El valor del hecho tiene que salir del borrador, no del modelo.
        const inDraft = raw.numeric ? bodyTokens.includes(value) : body.includes(value);
        if (!subject || !field || !value || !inDraft) return { ok: false, technical: ALC_TECHNICAL.CLAIM };
        if (raw.numeric) claimTokens.add(value);
        const assertions: AlcClaim["assertions"] = [];
        for (const a of raw.assertions) {
          const source = byId.get(a.sourceId);
          const start = source ? source.text.indexOf(a.quote) : -1;
          if (!source || start < 0) return { ok: false, technical: ALC_TECHNICAL.CITATION };
          assertions.push({
            citation: { sourceId: source.id, start, end: start + a.quote.length, quote: a.quote },
            value: a.value.trim(),
            unit: a.unit.trim() === "" ? null : a.unit.trim(),
          });
        }
        claims.push({
          id: claimId(subject, field),
          subject,
          field,
          value,
          unit: raw.unit.trim() === "" ? null : raw.unit.trim(),
          numeric: raw.numeric,
          ambiguous: raw.ambiguous,
          assertions,
        });
      }
      // Cobertura determinista: todo número del borrador debe ser el valor de alguna afirmación.
      const covered = bodyTokens.every((token) => claimTokens.has(token));
      return { ok: true, facts: { claims, contentCoverageComplete: generated.output.contentCoverageComplete && covered } };
    },
  };
}
