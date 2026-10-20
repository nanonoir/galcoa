import "server-only";

import type { DraftOutput } from "./schema";

/**
 * Defensas deterministas y acotadas sobre la salida del Agente 1 (S.4). No son
 * un validador lingüístico: solo cubren dos degradaciones concretas y
 * verificables. Se ejecutan después de `checkProvenance`, no cambian números ni
 * la procedencia estructurada (facts, advertencias) y no bloquean.
 *
 * 1. Correcciones identidad o que solo quitan tildes (recibió → recibio): se
 *    descartan del listado. NUNCA se reescribe el título/cuerpo: una
 *    restauración global corrompería homógrafos (esta/está, cambio/cambió) y
 *    mayúsculas. La prosa se deja como la propuso el modelo.
 * 2. Referencias de fuente en prosa (título/cuerpo): solo se quitan los grupos
 *    entre paréntesis o corchetes formados únicamente por refs conocidas
 *    («(m1)», «[m1, e2]», «(fuente m1)»). Una ref que aparece como palabra en
 *    el texto de alguna fuente puede ser un código de negocio y se conserva.
 */

const MARKS = /\p{M}/gu;
const stripMarks = (s: string) => s.normalize("NFD").replace(MARKS, "");
const markCount = (s: string) => (s.normalize("NFD").match(MARKS) ?? []).length;

/** Solo quita tildes/diacríticos: mismas letras, menos marcas. */
function dropsAccentsOnly(original: string, corrected: string): boolean {
  return (
    stripMarks(original).toLowerCase() === stripMarks(corrected).toLowerCase() &&
    markCount(corrected) < markCount(original)
  );
}

function isIdentity(original: string, corrected: string): boolean {
  return original.normalize("NFC") === corrected.normalize("NFC");
}

const REF = "[me]\\d{1,3}";
const REF_GROUP = new RegExp(
  `[ \\t]?[(\\[]\\s*(?:(?:fuentes?|refs?)\\s*:?\\s*)?${REF}(?:\\s*(?:,|;|/|\\by\\b|\\be\\b)\\s*${REF})*\\s*[)\\]]`,
  "giu",
);

function stripSourceRefs(text: string, known: ReadonlySet<string>, protectedRefs: ReadonlySet<string>): string {
  const cleaned = text.replace(REF_GROUP, (group) => {
    const refs = group.match(new RegExp(REF, "gi")) ?? [];
    // Una ref en mayúscula, desconocida o presente en las fuentes no es una cita de procedencia.
    const removable = refs.every((r) => r === r.toLowerCase() && known.has(r) && !protectedRefs.has(r));
    return removable ? "" : group;
  });
  return cleaned === text ? text : cleaned.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:])/g, "$1").trim();
}

const countRefGroups = (text: string) => (text.match(REF_GROUP) ?? []).length;

export interface SanitizedDraft {
  output: DraftOutput;
  /** Rastro determinista de lo que se descartó/limpió; solo conteos, sin contenido del usuario. */
  notes: string[];
}

export function sanitizeDraftOutput(output: DraftOutput, sources: ReadonlyMap<string, string>): SanitizedDraft {
  const { title, body } = output;
  const corrections: DraftOutput["corrections"] = [];
  const notes: string[] = [];

  for (const c of output.corrections) {
    if (isIdentity(c.original, c.corrected) || dropsAccentsOnly(c.original, c.corrected)) continue;
    corrections.push(c);
  }
  const discarded = output.corrections.length - corrections.length;
  if (discarded > 0) {
    notes.push(
      `Se descartaron ${discarded} corrección(es) del listado por no aportar cambio o solo quitar tildes; el texto del borrador no se modificó por ello.`,
    );
  }

  const known = new Set(sources.keys());
  const protectedRefs = new Set<string>();
  for (const text of sources.values()) {
    for (const ref of known) {
      if (new RegExp(`(?<![\\p{L}\\p{N}])${ref}(?![\\p{L}\\p{N}])`, "iu").test(text)) protectedRefs.add(ref);
    }
  }
  const cleanTitle = stripSourceRefs(title, known, protectedRefs);
  const cleanBody = stripSourceRefs(body, known, protectedRefs);

  const finalTitle = cleanTitle || title;
  const finalBody = cleanBody || body;
  const removed = countRefGroups(title) + countRefGroups(body) - countRefGroups(finalTitle) - countRefGroups(finalBody);
  if (removed > 0) {
    notes.push(
      `Se quitaron ${removed} referencia(s) de fuente entre paréntesis o corchetes del título/cuerpo; la procedencia sigue en los hechos.`,
    );
  }

  return { output: { ...output, title: finalTitle, body: finalBody, corrections }, notes };
}
