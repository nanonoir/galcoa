import type { DemoColor, DemoDocumentView, DemoRemito } from "@/features/demo/contracts/demo-view";
import { ALC_COLOR, ALC_OUTCOME, ALC_READING, ALC_RULE, ALC_SOURCE_KIND, type AlcInput, type AlcResult, type AlcRuleId } from "@/lib/contracts/alc";
import { evaluateAlc } from "@/lib/rules/alc";

/**
 * Escenario de ejemplo de la demo pública (conversion-funnel.md, D1). Datos
 * ficticios: no corresponden a ninguna distribuidora ni comercio reales. La
 * extracción es determinista y está rotulada como simulada; el color lo decide
 * el motor de reglas real (`evaluateAlc`), igual que en el producto.
 */

export const DEMO_UNIT = "cajas";
const MERCHANT = "Almacén Los Pinos";
const PRODUCT = "Agua mineral 500 ml";
const TIME = "9:42";

export const MAX_DEMO_QUANTITY = 9999;

/** Cantidad válida: entero positivo sin separadores (como exige el motor). */
export function parseDemoQuantity(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_DEMO_QUANTITY ? String(n) : null;
}

export function demoMessage(quantity: string): string {
  return `Entregué ${quantity} ${DEMO_UNIT} de ${PRODUCT} en ${MERCHANT} a las ${TIME}.`;
}

/** Texto leído del remito de ejemplo; con «diferencia» faltan dos cajas (regla 200/198). */
export function demoRemitoText(quantity: string, remito: DemoRemito): string | null {
  if (remito === "sin_remito") return null;
  const delivered = remito === "coincide" ? quantity : String(Math.max(Number(quantity) - 2, 0));
  return `Remito 0001-00004512 · ${MERCHANT} · ${PRODUCT} · Cantidad recibida: ${delivered} ${DEMO_UNIT}`;
}

export function demoDocument(quantity: string): DemoDocumentView {
  return { comercio: MERCHANT, producto: PRODUCT, cantidad: quantity, unidad: DEMO_UNIT, hora: TIME };
}

/** Cita exacta «N cajas» dentro de una fuente, como la entrega el extractor del producto. */
function citation(sourceId: string, text: string) {
  const match = /(\d+) cajas/.exec(text);
  if (!match) throw new Error("La fuente de ejemplo no tiene cantidad");
  return {
    citation: { sourceId, start: match.index, end: match.index + match[0].length, quote: match[0] },
    value: match[1],
    unit: DEMO_UNIT,
  };
}

/** Arma la entrada ALC con las fuentes de ejemplo; las huellas son SHA-256 reales de cada texto. */
export function buildDemoAlcInput(input: {
  quantity: string;
  message: string;
  messageHash: string;
  remitoText: string | null;
  remitoHash: string | null;
}): AlcInput {
  const sources: AlcInput["sources"] = [
    { id: "mensaje-1", originalId: "mensaje-1", kind: ALC_SOURCE_KIND.MESSAGE, hash: input.messageHash, reading: ALC_READING.READABLE, text: input.message },
  ];
  const assertions = [citation("mensaje-1", input.message)];
  if (input.remitoText && input.remitoHash) {
    sources.push({ id: "remito-1", originalId: "remito-1", kind: ALC_SOURCE_KIND.EVIDENCE, hash: input.remitoHash, reading: ALC_READING.READABLE, text: input.remitoText });
    assertions.push(citation("remito-1", input.remitoText));
  }
  return {
    documentId: "demo",
    draftRevision: 1,
    selection: ["autor", "comprador"],
    inventoryComplete: true,
    contentCoverageComplete: true,
    sources,
    claims: [
      { id: "cantidad", subject: "entrega-1", field: "cantidad", value: input.quantity, unit: DEMO_UNIT, numeric: true, ambiguous: false, assertions },
    ],
  };
}

const REASONS: Partial<Record<AlcRuleId, string>> = {
  [ALC_RULE.MATCHING]: "La cantidad de tu mensaje coincide con la del remito.",
  [ALC_RULE.DECLARED]: "La cantidad solo está en tu mensaje: queda como «declarada», sin un comprobante que la respalde.",
  [ALC_RULE.CONTRADICTION]: "Tu mensaje y el remito no dicen la misma cantidad. Hay que aclarar la diferencia antes de sellar.",
  [ALC_RULE.AMBIGUITY]: "No se puede determinar qué se está confirmando.",
  [ALC_RULE.UNREADABLE]: "Un comprobante no se pudo leer.",
  [ALC_RULE.PARTICIPANTS]: "Faltan participantes obligatorios.",
};

/** Traduce el resultado del motor a la vista; un fallo técnico nunca se muestra como un color. */
export function toDemoVerdict(result: AlcResult): { color: DemoColor; reasons: string[]; sealable: boolean } | null {
  if (result.status !== ALC_OUTCOME.EVALUATED) return null;
  const reasons = [...new Set(result.findings.map((f) => REASONS[f.ruleId]).filter((r): r is string => Boolean(r)))];
  return { color: result.color, reasons, sealable: result.color !== ALC_COLOR.RED };
}

export function evaluateDemo(input: Parameters<typeof buildDemoAlcInput>[0]) {
  return toDemoVerdict(evaluateAlc(buildDemoAlcInput(input)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
