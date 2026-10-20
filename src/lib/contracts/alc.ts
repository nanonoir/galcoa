/**
 * Contrato ALC (F-1 a F-5; docs/exec-plans/active/alineacion-distribuidoras.md).
 * Veredicto determinista de tres colores, independiente del control documental
 * informativo heredado. El color nunca sale de la IA: ella propone afirmaciones
 * con cita y el código (`lib/rules/alc.ts`) decide.
 */

export const ALC_RULES_VERSION = "galcoa.alc.v1";

export const ALC_COLOR = { GREEN: "verde", YELLOW: "amarillo", RED: "rojo" } as const;
export type AlcColor = (typeof ALC_COLOR)[keyof typeof ALC_COLOR];

export const ALC_OUTCOME = { EVALUATED: "evaluated", TECHNICAL: "technical_failure" } as const;

/** Catálogo técnico de reglas con ID estable. */
export const ALC_RULE = {
  CONTRADICTION: "ALC-CONTRADICCION",
  UNREADABLE: "ALC-NO-LECTURA",
  AMBIGUITY: "ALC-AMBIGUEDAD",
  DECLARED: "ALC-DATO-DECLARADO",
  MATCHING: "ALC-FUENTES-COINCIDENTES",
  PARTICIPANTS: "ALC-PARTICIPANTES",
  CONFIRMATIONS: "ALC-CONFIRMACIONES",
} as const;
export type AlcRuleId = (typeof ALC_RULE)[keyof typeof ALC_RULE];

export const ALC_READING = {
  READABLE: "legible",
  UNREADABLE: "ilegible",
  PENDING: "pendiente",
  ERROR: "error_tecnico",
} as const;
export type AlcReading = (typeof ALC_READING)[keyof typeof ALC_READING];

export const ALC_SOURCE_KIND = { MESSAGE: "mensaje", EVIDENCE: "evidencia" } as const;
export type AlcSourceKind = (typeof ALC_SOURCE_KIND)[keyof typeof ALC_SOURCE_KIND];

/** Impedimentos técnicos de etapa: no son un cuarto color ni un falso rojo. */
export const ALC_TECHNICAL = {
  INPUT: "ALC_INPUT_INVALID",
  INVENTORY: "ALC_INVENTORY_INCOMPLETE",
  SOURCE: "ALC_SOURCE_INVALID",
  READING: "ALC_READING_INCOMPLETE",
  CLAIM: "ALC_CLAIM_INVALID",
  CITATION: "ALC_CITATION_INVALID",
} as const;
export type AlcTechnical = (typeof ALC_TECHNICAL)[keyof typeof ALC_TECHNICAL];

export type AlcSource = {
  id: string;
  /** Original del que deriva (dos extracciones del mismo original no suman corroboración). */
  originalId: string;
  kind: AlcSourceKind;
  /** SHA-256 hexadecimal del contenido original. */
  hash: string;
  reading: AlcReading;
  text: string;
};

export type AlcCitation = { sourceId: string; start: number; end: number; quote: string };

export type AlcAssertion = { citation: AlcCitation; value: string; unit: string | null };

export type AlcClaim = {
  id: string;
  /** Ítem o entrega a la que se refiere; solo se comparan afirmaciones del mismo sujeto. */
  subject: string;
  field: string;
  value: string;
  unit: string | null;
  numeric: boolean;
  /** El alcance de lo afirmado no puede determinarse. */
  ambiguous: boolean;
  assertions: AlcAssertion[];
};

export type AlcInput = {
  documentId: string;
  draftRevision: number;
  selection: readonly string[];
  /** El servidor capturó todas las fuentes usadas del documento. */
  inventoryComplete: boolean;
  /** Cada parte material del cuerpo quedó mapeada a una afirmación. */
  contentCoverageComplete: boolean;
  sources: AlcSource[];
  claims: AlcClaim[];
};

export type AlcFinding = { ruleId: AlcRuleId; claimId: string | null; sourceIds: string[] };

export type AlcResult =
  | { status: typeof ALC_OUTCOME.EVALUATED; rulesVersion: typeof ALC_RULES_VERSION; color: AlcColor; findings: AlcFinding[] }
  | { status: typeof ALC_OUTCOME.TECHNICAL; code: AlcTechnical };

/** Códigos de denegación estructurada comunes a DTO, adaptador, SQL y pruebas. */
export const ALC_BLOCK = {
  EVALUATION_REQUIRED: "evaluation_required",
  STALE_EVALUATION: "stale_evaluation",
  RED: "red",
  SELECTION_INVALID: "selection_invalid",
  CONFIRMATION_ORDER: "confirmation_order",
  CONFIRMATIONS_MISSING: "confirmations_missing",
} as const;
export type AlcBlockCode = (typeof ALC_BLOCK)[keyof typeof ALC_BLOCK];
