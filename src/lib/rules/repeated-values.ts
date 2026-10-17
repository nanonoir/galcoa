import { repeatedValues, type IndicatorThresholds, type RuleFinding } from "./indicators";

/**
 * Orquestación del único indicador habilitado: valores repetidos (MVP-013,
 * decisión de producto del líder, 2026-10-17: umbral de 4 mediciones idénticas
 * consecutivas, severidad `warning`, texto neutro, no bloquea).
 *
 * Extracción determinista y conservadora: cada fuente (mensaje del autor o
 * extracción de evidencia) es una serie propia con los números de su texto en
 * orden de aparición. Fechas y horas se descartan, igual que las cifras pegadas
 * a letras (códigos) o muy largas (teléfonos, ids). `5,0` y `5.0` son el mismo
 * valor. Sin al menos `REPEATED_VALUES_RUN` números en una fuente no hay datos
 * suficientes: no se evalúa ni se emite nada.
 */

export const REPEATED_VALUES_RUN = 4;
const THRESHOLDS: IndicatorThresholds = { repeatedRun: REPEATED_VALUES_RUN };

export type SeriesSource = { kind: "mensaje" | "evidencia"; id: string; text: string };

export type RepeatedValuesSignal = { source: Pick<SeriesSource, "kind" | "id">; finding: RuleFinding };

const DATE = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/g;
const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const NUMBER = /(?<![\p{L}\p{N}_.,/:])\d+(?:[.,]\d+)?/gu;

export function extractNumbers(text: string): number[] {
  const cleaned = text.replace(DATE, " ").replace(TIME, " ");
  return [...cleaned.matchAll(NUMBER)]
    .map((m) => m[0])
    .filter((token) => token.replace(/\D/g, "").length < 9)
    .map((token) => Number(token.replace(",", ".")));
}

/**
 * `evaluated` es verdadero si al menos una fuente tenía datos suficientes (la
 * regla corrió); sin eso `rulesEvaluated` no debe afirmarse.
 */
export function evaluateRepeatedValues(sources: readonly SeriesSource[]): { evaluated: boolean; signals: RepeatedValuesSignal[] } {
  let evaluated = false;
  const signals: RepeatedValuesSignal[] = [];
  const ordered = [...sources].sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.kind < b.kind ? -1 : 1));
  for (const source of ordered) {
    const ref = `${source.kind}:${source.id}`;
    const finding = repeatedValues(extractNumbers(source.text).map((value) => ({ ref, value })), THRESHOLDS);
    if (finding.outcome === "no_evaluado") continue;
    evaluated = true;
    if (finding.outcome === "senal") signals.push({ source: { kind: source.kind, id: source.id }, finding });
  }
  return { evaluated, signals };
}
