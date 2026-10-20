import { randomUUID } from "node:crypto";

import type { AlcEvaluateInput, AlcEvaluation } from "@/lib/documents/alc/service";
import type { TechnicalError } from "@/lib/contracts/technical";

/**
 * Doble del evaluador ALC, exclusivo de tests de servicio. El color lo fija el test (nunca el llamador del congelado).
 * Registra las llamadas para comprobar qué recibió el evaluador. No acredita IA, SQL ni RLS.
 */
/** Evaluación sintética lista para `buildFrozenSnapshot`. */
export function fakeEvaluation(color: "verde" | "amarillo" | "rojo" = "amarillo", selection: string[] = ["autor", "comprador"]): AlcEvaluation {
  return {
    evaluationId: randomUUID(),
    color,
    selection,
    rectifications: [],
    sourceAliases: [],
    shared: {
      rulesVersion: "galcoa.alc.v1",
      color,
      inputHash: "a".repeat(64),
      findings: [{ ruleId: color === "verde" ? "ALC-FUENTES-COINCIDENTES" : color === "rojo" ? "ALC-CONTRADICCION" : "ALC-DATO-DECLARADO", claimId: "c_1", sources: [] }],
      claims: [{ id: "c_1", subject: "cajas", field: "cantidad", value: "12", unit: null, status: color === "verde" ? "confirmado" : color === "rojo" ? "contradicho" : "declarado" }],
    },
  };
}

export function fakeAlc(options: { color?: "verde" | "amarillo" | "rojo"; fail?: TechnicalError } = {}) {
  const calls: AlcEvaluateInput[] = [];
  const color = options.color ?? "amarillo";
  return {
    calls,
    async evaluate(input: AlcEvaluateInput): Promise<{ ok: true; value: AlcEvaluation } | { ok: false; error: TechnicalError }> {
      calls.push(input);
      if (options.fail) return { ok: false, error: options.fail };
      return { ok: true, value: { ...fakeEvaluation(color, [...input.selection]) } };
    },
  };
}
