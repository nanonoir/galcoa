import type { DeclaredEventDate } from "@/lib/contracts/core";

/**
 * Señales ALCOA+ deterministas (MVP-061; sources-and-ai §3, INV-09/16).
 *
 * Son **señales de revisión**, no pruebas de fraude ni de falsedad: el texto
 * es neutro y la severidad máxima es `warning`. Los umbrales entran como
 * configuración y, si falta, la señal responde «no evaluado», sin valores
 * ocultos. Una fecha sin instante declarado no se completa con la de carga.
 *
 * Decisión de producto (líder, 2026-10-17, MVP-013): solo `repeatedValues`
 * está habilitado, con umbral 4 (`repeated-values.ts`). `lateUpload`,
 * `retroactiveBatch` y `pdfMetadata` quedan **descartados**: se conservan
 * como código inerte, no se invocan desde ninguna orquestación y no deben
 * cablearse sin una nueva decisión.
 */

/** Códigos de hallazgo habilitados por decisión de producto. */
export const ENABLED_INDICATORS: readonly RuleFinding["code"][] = ["valores_repetidos"];

export type IndicatorThresholds = {
  /** Horas entre el hecho declarado y la carga a partir de las que se señala carga tardía. */
  lateUploadHours?: number;
  /** Ventana (minutos) y cantidad mínima de cargas con hechos en momentos distintos para un lote retroactivo. */
  retroactiveBatch?: { windowMinutes: number; minCount: number };
  /** Cantidad mínima de valores idénticos consecutivos. */
  repeatedRun?: number;
  /** Horas entre creación y modificación del PDF a partir de las que se señala. */
  pdfModificationHours?: number;
};

export type RuleFinding = {
  code: "carga_tardia" | "lote_retroactivo" | "valores_repetidos" | "metadatos_pdf";
  outcome: "senal" | "sin_senal" | "no_evaluado";
  /** Motivo de `no_evaluado` (sin datos o sin umbral). */
  reason?: "umbral_no_configurado" | "fecha_sin_instante" | "sin_metadatos" | "datos_insuficientes";
  /** Texto neutro: «señal de revisión». */
  message: string;
  severity: "warning";
  /** Refs privadas de las fuentes (m#, e#). */
  sources: string[];
  /** Parámetros usados, para reproducir el resultado. */
  params: Record<string, number | string>;
};

const HOUR = 3_600_000;

const notEvaluated = (code: RuleFinding["code"], reason: NonNullable<RuleFinding["reason"]>, sources: string[] = []): RuleFinding => ({
  code,
  outcome: "no_evaluado",
  reason,
  message: reason === "umbral_no_configurado" ? "No evaluado: umbral no configurado." : "No evaluado: faltan datos para esta señal.",
  severity: "warning",
  sources,
  params: {},
});

const declaredInstant = (d: DeclaredEventDate): number | null => (d.kind === "declared" && d.instant ? Date.parse(d.instant) : null);

/** Carga tardía: hecho declarado con instante vs. fecha real de carga del servidor. No habilitado por decisión de producto. */
export function lateUpload(
  source: { ref: string; declaredEventDate: DeclaredEventDate; uploadedAt: string },
  thresholds: IndicatorThresholds,
): RuleFinding {
  if (thresholds.lateUploadHours === undefined) return notEvaluated("carga_tardia", "umbral_no_configurado", [source.ref]);
  const declared = declaredInstant(source.declaredEventDate);
  if (declared === null) return notEvaluated("carga_tardia", "fecha_sin_instante", [source.ref]);
  const hours = (Date.parse(source.uploadedAt) - declared) / HOUR;
  const params = { lateUploadHours: thresholds.lateUploadHours, observedHours: Math.round(hours * 10) / 10 };
  return hours > thresholds.lateUploadHours
    ? {
        code: "carga_tardia",
        outcome: "senal",
        message: `Señal de revisión: se cargó ${params.observedHours} h después del hecho declarado.`,
        severity: "warning",
        sources: [source.ref],
        params,
      }
    : { code: "carga_tardia", outcome: "sin_senal", message: "Sin señal de carga tardía.", severity: "warning", sources: [source.ref], params };
}

/** Lote retroactivo: varias cargas en una ventana corta que declaran hechos en momentos distintos. No habilitado por decisión de producto. */
export function retroactiveBatch(
  sources: readonly { ref: string; declaredEventDate: DeclaredEventDate; uploadedAt: string }[],
  thresholds: IndicatorThresholds,
): RuleFinding {
  const cfg = thresholds.retroactiveBatch;
  if (!cfg) return notEvaluated("lote_retroactivo", "umbral_no_configurado");
  const dated = sources
    .map((s) => ({ ref: s.ref, declared: declaredInstant(s.declaredEventDate), uploaded: Date.parse(s.uploadedAt) }))
    .filter((s): s is { ref: string; declared: number; uploaded: number } => s.declared !== null)
    .sort((a, b) => a.uploaded - b.uploaded || (a.ref < b.ref ? -1 : 1));
  if (dated.length < cfg.minCount) return notEvaluated("lote_retroactivo", "datos_insuficientes");
  const params = { windowMinutes: cfg.windowMinutes, minCount: cfg.minCount };
  for (let i = 0; i < dated.length; i++) {
    const window = dated.filter((s) => s.uploaded >= dated[i].uploaded && s.uploaded - dated[i].uploaded <= cfg.windowMinutes * 60_000);
    if (window.length >= cfg.minCount && new Set(window.map((s) => s.declared)).size >= cfg.minCount) {
      return {
        code: "lote_retroactivo",
        outcome: "senal",
        message: `Señal de revisión: ${window.length} registros de momentos distintos se cargaron dentro de ${cfg.windowMinutes} minutos.`,
        severity: "warning",
        sources: window.map((s) => s.ref),
        params,
      };
    }
  }
  return { code: "lote_retroactivo", outcome: "sin_senal", message: "Sin señal de carga en lote.", severity: "warning", sources: [], params };
}

/** Valores idénticos consecutivos (p. ej. la misma medición repetida). */
export function repeatedValues(values: readonly { ref: string; value: number }[], thresholds: IndicatorThresholds): RuleFinding {
  if (thresholds.repeatedRun === undefined) return notEvaluated("valores_repetidos", "umbral_no_configurado");
  if (values.length < thresholds.repeatedRun) return notEvaluated("valores_repetidos", "datos_insuficientes");
  const params = { repeatedRun: thresholds.repeatedRun };
  let start = 0;
  for (let i = 1; i <= values.length; i++) {
    if (i === values.length || values[i].value !== values[start].value) {
      if (i - start >= thresholds.repeatedRun) {
        return {
          code: "valores_repetidos",
          outcome: "senal",
          message: `Señal de revisión: el valor ${values[start].value} se repite ${i - start} veces seguidas.`,
          severity: "warning",
          sources: values.slice(start, i).map((v) => v.ref),
          params,
        };
      }
      start = i;
    }
  }
  return { code: "valores_repetidos", outcome: "sin_senal", message: "Sin valores repetidos.", severity: "warning", sources: [], params };
}

/** Metadatos del PDF: modificación posterior a la creación. Sin metadatos no se presume nada. No habilitado por decisión de producto. */
export function pdfMetadata(
  source: { ref: string; metadata: { createdAt: string | null; modifiedAt: string | null; producer: string | null } | null },
  thresholds: IndicatorThresholds,
): RuleFinding {
  if (thresholds.pdfModificationHours === undefined) return notEvaluated("metadatos_pdf", "umbral_no_configurado", [source.ref]);
  const m = source.metadata;
  if (!m?.createdAt || !m.modifiedAt) return notEvaluated("metadatos_pdf", "sin_metadatos", [source.ref]);
  const hours = (Date.parse(m.modifiedAt) - Date.parse(m.createdAt)) / HOUR;
  const params = { pdfModificationHours: thresholds.pdfModificationHours, observedHours: Math.round(hours * 10) / 10, producer: m.producer ?? "no informado" };
  return hours > thresholds.pdfModificationHours
    ? {
        code: "metadatos_pdf",
        outcome: "senal",
        message: `Señal de revisión: el PDF se modificó ${params.observedHours} h después de creado.`,
        severity: "warning",
        sources: [source.ref],
        params,
      }
    : { code: "metadatos_pdf", outcome: "sin_senal", message: "Sin señal en los metadatos del PDF.", severity: "warning", sources: [source.ref], params };
}
