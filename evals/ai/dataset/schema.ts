import { z } from "zod";

import { ControlStatusSchema } from "@/lib/contracts/document";

/**
 * Dataset de evaluación de IA (MVP-122; PRD §12, release-validation §4).
 *
 * Datos ficticios. Los casos son las fuentes que reciben los agentes; las
 * etiquetas son lo esperado, fijado por personas **antes** de ejecutar
 * cualquier modelo evaluado. Este módulo no llama a proveedores ni importa
 * `src/lib/ai`: solo define la forma y valida.
 */

export const CaseIdSchema = z.string().regex(/^C\d{2}$/);
export const SourceRefSchema = z.string().regex(/^[me]\d$/);

export const CaseCategorySchema = z.enum([
  "correcto",
  "ortografia_inocua",
  "cantidad_contradictoria",
  "precio_contradictorio",
  "unidad_ausente",
  "fecha_ausente",
  "destinatario_distinto",
  "carga_posterior",
  "valor_distinto_evidencia",
  "combinado",
  "instruccion_inyectada",
]);

export const EvalSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ref: SourceRefSchema.refine((r) => r.startsWith("m"), "Los mensajes usan ref m#"),
    kind: z.literal("mensaje"),
    uploadedAt: z.iso.datetime(),
    text: z.string().min(1),
  }),
  z.strictObject({
    ref: SourceRefSchema.refine((r) => r.startsWith("e"), "Las extracciones usan ref e#"),
    kind: z.literal("extraccion"),
    /** Archivo del que Gemini extraería el texto: el contraste no es independiente de esa lectura. */
    origin: z.enum(["pdf", "imagen"]),
    uploadedAt: z.iso.datetime(),
    text: z.string().min(1),
  }),
]);

export const EvalCaseSchema = z
  .strictObject({
    id: CaseIdSchema,
    demo: z.boolean(),
    domain: z.enum(["entrega", "medicion"]),
    category: CaseCategorySchema,
    sources: z.array(EvalSourceSchema).min(1),
  })
  .refine((c) => new Set(c.sources.map((s) => s.ref)).size === c.sources.length, {
    message: "Refs de fuente duplicadas en el caso",
  });

export const WarningTypeSchema = z.enum([
  "cantidad_contradictoria",
  "precio_contradictorio",
  "unidad_no_informada",
  "fecha_no_informada",
  "destinatario_distinto",
  "carga_posterior_al_hecho",
  "valor_distinto_entre_fuentes",
]);

export const ExpectedWarningSchema = z.strictObject({
  type: WarningTypeSchema,
  /** Aun `critical` es una advertencia: nunca bloquea confirmar (INV-02). */
  severity: z.enum(["warning", "critical"]),
  sources: z.array(SourceRefSchema).min(1),
});

/** Dato aportado por las fuentes: lo único que la redacción puede afirmar. */
export const AllowedFactSchema = z.strictObject({
  field: z.string().min(1),
  value: z.string().min(1),
  sources: z.array(SourceRefSchema).min(1),
});

export const CaseLabelSchema = z.strictObject({
  caseId: CaseIdSchema,
  expectedControlStatus: ControlStatusSchema.exclude(["sin_evaluar"]),
  expectedWarnings: z.array(ExpectedWarningSchema),
  allowedFacts: z.array(AllowedFactSchema).min(1),
  /** Campos que deben figurar como «no informado», nunca completados (INV-10). */
  notInformed: z.array(z.string().min(1)),
  /** Correcciones ortográficas o de formato esperadas (no son errores materiales). */
  innocuousCorrections: z.array(z.string().min(1)),
  /** El caso depende de texto extraído por Gemini (sin independencia visual de Groq). */
  dependsOnGeminiExtraction: z.boolean(),
  justification: z.string().min(1),
});

export const LabelsFileSchema = z.strictObject({
  datasetVersion: z.literal("v1"),
  labeledBy: z.string().min(1),
  method: z.string().min(1),
  labels: z.array(CaseLabelSchema),
});

export const CasesFileSchema = z.strictObject({
  datasetVersion: z.literal("v1"),
  description: z.string().min(1),
  cases: z.array(EvalCaseSchema),
});

export const LabelsLockSchema = z.strictObject({
  datasetVersion: z.literal("v1"),
  labelsFile: z.literal("labels.v1.json"),
  /** SHA-256 del JSON canónico (claves ordenadas): independiente de los fines de línea. */
  canonicalSha256: z.string().regex(/^[0-9a-f]{64}$/),
  frozenAt: z.iso.datetime(),
  /** Ningún modelo evaluado (Gemini, Groq) se ejecutó sobre el dataset antes de congelar. */
  evaluatedModelsRunBeforeFreeze: z.literal(false),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type CaseLabel = z.infer<typeof CaseLabelSchema>;

/** JSON canónico: claves ordenadas, sin espacios. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Estado de control que corresponde a un conjunto de advertencias esperadas. */
export function controlStatusFor(warnings: readonly { severity: "warning" | "critical" }[]) {
  if (warnings.some((w) => w.severity === "critical")) return "contradiccion_critica" as const;
  if (warnings.length > 0) return "con_advertencias" as const;
  return "sin_inconsistencias_criticas_detectadas" as const;
}
