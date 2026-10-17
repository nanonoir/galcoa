import { SharedWarningSchema, type SharedWarning } from "@/lib/contracts/review";

import type { RuleFinding } from "./indicators";

/**
 * Consolidación de advertencias y proyección compartible (MVP-062; REQ-06,
 * INV-02/10; SH-02).
 *
 * Une lo que dicen el Agente 1, el Agente 2 y las reglas, con su origen, la
 * revisión evaluada y las fuentes. Solo agrupa con una clave determinista
 * (mismo código o mismo texto, y mismas fuentes) y **nunca** descarta una
 * contradicción: ambas cifras quedan visibles. Nada aquí bloquea.
 */

export type WarningOrigin = "agente1" | "agente2" | "reglas";

export type WarningInput = {
  origin: WarningOrigin;
  draftRevision: number;
  /** Código estable (reglas) o `null` para texto de un agente. */
  code: string | null;
  message: string;
  severity: "warning" | "critical";
  /** Refs privadas (m#, e#); `b#` del borrador no es una fuente. */
  sources: readonly string[];
};

export type ConsolidatedWarning = {
  key: string;
  origins: WarningOrigin[];
  draftRevision: number;
  severity: "warning" | "critical";
  messages: string[];
  sources: string[];
};

const normalize = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
const ORIGIN_ORDER: WarningOrigin[] = ["agente1", "agente2", "reglas"];

/** Hallazgos de reglas que son señal (los «sin señal» y «no evaluado» no son advertencias). */
export function ruleWarnings(findings: readonly RuleFinding[], draftRevision: number): WarningInput[] {
  return findings
    .filter((f) => f.outcome === "senal")
    .map((f) => ({ origin: "reglas" as const, draftRevision, code: f.code, message: f.message, severity: f.severity, sources: f.sources }));
}

/**
 * Advertencias vigentes de `draftRevision` y, aparte, las de revisiones
 * anteriores marcadas como desactualizadas (privadas; nunca evaluación vigente).
 */
export function consolidateWarnings(
  inputs: readonly WarningInput[],
  draftRevision: number,
): { current: ConsolidatedWarning[]; stale: ConsolidatedWarning[] } {
  const groups = new Map<string, ConsolidatedWarning>();
  for (const w of inputs) {
    const sources = [...new Set(w.sources.filter((r) => /^[me]\d+$/.test(r)))].sort();
    const identity = w.code ? `code:${w.code}` : `text:${normalize(w.message)}`;
    const key = `${w.draftRevision}|${identity}|${sources.join(",")}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, origins: [w.origin], draftRevision: w.draftRevision, severity: w.severity, messages: [w.message], sources });
      continue;
    }
    if (!group.origins.includes(w.origin)) group.origins.push(w.origin);
    if (w.severity === "critical") group.severity = "critical";
    if (!group.messages.includes(w.message)) group.messages.push(w.message);
  }
  const ordered = [...groups.values()]
    .map((g) => ({ ...g, origins: ORIGIN_ORDER.filter((o) => g.origins.includes(o)) }))
    .sort((a, b) => (a.severity === b.severity ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.severity === "critical" ? -1 : 1));
  return {
    current: ordered.filter((g) => g.draftRevision === draftRevision),
    stale: ordered.filter((g) => g.draftRevision !== draftRevision),
  };
}

/** Advertencia de contradicción de cantidades: ambas cifras y ambas fuentes, sin elegir. */
export function quantityContradiction(a: { value: string; ref: string }, b: { value: string; ref: string }, draftRevision: number): WarningInput {
  return {
    origin: "reglas",
    draftRevision,
    code: "cantidad_contradictoria",
    message: `Las fuentes no coinciden: ${a.value} (${a.ref}) y ${b.value} (${b.ref}).`,
    severity: "critical",
    sources: [a.ref, b.ref],
  };
}

/** Dato faltante: «unidad no informada» o «fecha no informada», sin completar nada. */
export function missingData(field: "unidad" | "fecha", ref: string, draftRevision: number): WarningInput {
  return { origin: "reglas", draftRevision, code: `${field}_no_informada`, message: `${field === "unidad" ? "Unidad" : "Fecha"} no informada.`, severity: "warning", sources: [ref] };
}

/**
 * Proyección para el snapshot compartible (SH-02): alias «Fuente A», «Fuente
 * B»… con descripciones compartibles, sin ids, rutas, URLs ni nombres de
 * archivo. La tabla alias → ref privada vuelve aparte y no viaja al snapshot.
 * Cada salida se valida con el esquema estricto del contrato.
 */
export function projectSharedWarnings(
  warnings: readonly ConsolidatedWarning[],
  describe: (ref: string) => string,
): { shared: SharedWarning[]; aliasTable: { alias: string; ref: string }[] } {
  const aliases = new Map<string, string>();
  const aliasFor = (ref: string) => {
    if (!aliases.has(ref)) aliases.set(ref, `Fuente ${String.fromCharCode(65 + (aliases.size % 26))}${aliases.size >= 26 ? Math.floor(aliases.size / 26) : ""}`);
    return aliases.get(ref)!;
  };
  const shared = warnings.map((w, i) => {
    // Primero las fuentes (orden estable), después las menciones dentro del texto.
    const sources = w.sources.map((ref) => ({ alias: aliasFor(ref), description: describe(ref) }));
    return SharedWarningSchema.parse({
      id: `aviso-${i + 1}`,
      message: w.messages.join(" / ").replace(/\(([me]\d+)\)/g, (_, ref: string) => `(${aliasFor(ref)})`),
      severity: w.severity,
      sources,
    });
  });
  return { shared, aliasTable: [...aliases.entries()].map(([ref, alias]) => ({ alias, ref })) };
}
