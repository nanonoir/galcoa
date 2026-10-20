import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { type AlcClaim, type AlcSource, type AlcTechnical } from "@/lib/contracts/alc";
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

/** Misma representación decimal que exige `evaluateAlc`. */
function decimal(value: string): string | null {
  return /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}

/** «1.500» o «1.500,5» del borrador en la forma sin separadores que pide el prompt. */
function normalizeNumber(token: string): string {
  return token.includes(",") ? token.replace(/\./g, "").replace(",", ".") : token.replace(/\.(?=\d{3}(?:\D|$))/g, "");
}

/** Espejo de la comprobación de cita de `evaluateAlc`: descartar aquí evita su fallo técnico. */
function literalInQuote(value: string, quote: string, numeric: boolean): boolean {
  if (!numeric) return quote.includes(value);
  const tokens: readonly string[] = quote.match(NUMBER_TOKEN) ?? [];
  return tokens.includes(value);
}

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

      // Lectura tolerante (deuda técnica 14): una afirmación o cita que no supera las comprobaciones se descarta en
      // lugar de abortar el congelado. El evaluador sigue recibiendo solo hechos que cumplen sus invariantes.
      const byId = new Map(readable.map((s) => [s.id, s]));
      const claims = new Map<string, AlcClaim>();
      const bodyTokens: string[] = body.match(NUMBER_TOKEN) ?? [];
      const claimTokens = new Set<string>();
      for (const raw of generated.output.claims) {
        const subject = raw.subject.trim();
        const field = raw.field.trim();
        const value = raw.value.trim();
        const unit = raw.unit.trim() === "" ? null : raw.unit.trim();
        if (!subject || !field || !value) continue;
        // Un «número» sin unidad o con separadores (fechas, códigos, 1.500) se compara como texto literal.
        let numeric = raw.numeric && unit !== null && decimal(value) !== null;
        let draftValue = value;
        if (numeric && !bodyTokens.includes(value)) {
          const token = bodyTokens.find((t) => normalizeNumber(t) === value);
          if (token) draftValue = token;
          else numeric = false;
        }
        // El valor del hecho tiene que salir del borrador, no del modelo.
        if (!numeric && !body.includes(value)) continue;
        for (const token of draftValue.match(NUMBER_TOKEN) ?? []) claimTokens.add(token);
        const assertions: AlcClaim["assertions"] = [];
        for (const a of raw.assertions) {
          const source = byId.get(a.sourceId);
          const start = source ? source.text.indexOf(a.quote) : -1;
          const assertionValue = a.value.trim();
          let assertionUnit = a.unit.trim() === "" ? null : a.unit.trim();
          if (assertionUnit !== null && unit !== null && assertionUnit.toLowerCase() === unit.toLowerCase() && a.quote.includes(unit)) assertionUnit = unit;
          if (assertionUnit === null && unit !== null && a.quote.includes(unit)) assertionUnit = unit;
          if (!source || start < 0 || !assertionValue || !literalInQuote(assertionValue, a.quote, numeric)) continue;
          if (assertionUnit !== null && !a.quote.includes(assertionUnit)) continue;
          assertions.push({ citation: { sourceId: source.id, start, end: start + a.quote.length, quote: a.quote }, value: assertionValue, unit: assertionUnit });
        }
        const id = claimId(subject, field);
        const previous = claims.get(id);
        if (previous) {
          // El mismo dato informado dos veces: se fusiona; si difiere, es ambiguo.
          previous.assertions.push(...assertions);
          if (previous.value !== value || previous.unit !== unit || previous.numeric !== numeric) previous.ambiguous = true;
          continue;
        }
        claims.set(id, { id, subject, field, value, unit, numeric, ambiguous: raw.ambiguous, assertions });
      }
      // Cobertura determinista: todo número del borrador debe figurar en el valor de alguna afirmación.
      const covered = bodyTokens.every((token) => claimTokens.has(token));
      return { ok: true, facts: { claims: [...claims.values()], contentCoverageComplete: generated.output.contentCoverageComplete && covered } };
    },
  };
}
