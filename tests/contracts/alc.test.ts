import { describe, expect, it } from "vitest";

import { ALC_COLOR, ALC_OUTCOME, ALC_RULE, ALC_TECHNICAL, type AlcInput, type AlcSource } from "@/lib/contracts/alc";
import { evaluateAlc, validAlcSelection } from "@/lib/rules/alc";

const evidence = (id: string, text: string): AlcSource => ({
  id, originalId: id, kind: "evidencia", hash: "a".repeat(64), reading: "legible", text,
});
function fixture(values = ["200"]): AlcInput {
  const sources = values.map((value, index) => evidence(`e${index}`, `${value} cajas`));
  return {
    documentId: "document", draftRevision: 1, selection: ["autor", "comprador"],
    inventoryComplete: true, contentCoverageComplete: true, sources,
    claims: [{
      id: "quantity", subject: "entrega/ítem-1", field: "cantidad", value: "200", unit: "cajas",
      numeric: true, ambiguous: false,
      assertions: sources.map((source, index) => ({
        citation: { sourceId: source.id, start: 0, end: source.text.length, quote: source.text },
        value: values[index], unit: "cajas",
      })),
    }],
  };
}

describe("ALC v1: reglas puras, todavía no autoridad de persistencia", () => {
  it("exige comprador, con transportista opcional y orden canónico", () => {
    expect(validAlcSelection(["autor", "comprador"])).toBe(true);
    expect(validAlcSelection(["autor", "intermediario", "comprador"])).toBe(true);
    for (const selection of [["autor"], ["autor", "intermediario"], ["comprador", "autor"], ["autor", "comprador", "comprador"]]) {
      expect(validAlcSelection(selection)).toBe(false);
      expect(evaluateAlc({ ...fixture(), selection })).toMatchObject({ color: ALC_COLOR.RED });
    }
  });

  it("200/200 es verde; 200/198 es rojo sin tolerancias ni mayoría", () => {
    expect(evaluateAlc(fixture())).toMatchObject({ status: ALC_OUTCOME.EVALUATED, color: ALC_COLOR.GREEN });
    for (const values of [["198"], ["200", "198"], ["200", "200", "198"], ["201"]]) {
      const result = evaluateAlc(fixture(values));
      expect(result).toMatchObject({ color: ALC_COLOR.RED });
      if (result.status === "evaluated") expect(result.findings.some((f) => f.ruleId === ALC_RULE.CONTRADICTION)).toBe(true);
    }
  });

  it("una declaración sin adjuntos es amarilla y no exige comprobantes inexistentes", () => {
    const input = fixture([]);
    expect(evaluateAlc(input)).toMatchObject({ color: ALC_COLOR.YELLOW });
  });

  it("repetir mensajes del mismo autor no inventa respaldo independiente", () => {
    const input = fixture(["200", "200"]);
    expect(evaluateAlc({ ...input, sources: input.sources.map((source) => ({ ...source, kind: "mensaje" })) }))
      .toMatchObject({ color: ALC_COLOR.YELLOW });
  });

  it("un adjunto ilegible nunca desaparece del inventario aunque no sea citado", () => {
    const input = fixture();
    const unreadable = { ...evidence("bad", ""), reading: "ilegible" } as const;
    expect(evaluateAlc({ ...input, sources: [...input.sources, unreadable] })).toMatchObject({ color: ALC_COLOR.RED });
  });

  it("pendiente, error técnico e inventario incompleto no inventan un color", () => {
    const input = fixture();
    expect(evaluateAlc({ ...input, inventoryComplete: false })).toEqual({ status: "technical_failure", code: ALC_TECHNICAL.INVENTORY });
    for (const reading of ["pendiente", "error_tecnico"] as const) {
      expect(evaluateAlc({ ...input, sources: [...input.sources, { ...evidence("pending", ""), reading }] }))
        .toEqual({ status: "technical_failure", code: ALC_TECHNICAL.READING });
    }
  });

  it("no produce verde omitiendo afirmaciones materiales", () => {
    expect(evaluateAlc({ ...fixture(), contentCoverageComplete: false })).toMatchObject({ color: ALC_COLOR.RED });
    expect(evaluateAlc({ ...fixture(), claims: [] })).toMatchObject({ color: ALC_COLOR.RED });
  });

  it("rechaza citas inventadas, offsets inválidos, valores ausentes y fuentes omitidas", () => {
    const input = fixture();
    const claim = input.claims[0];
    const assertion = claim.assertions[0];
    const citations = [
      { ...assertion.citation, sourceId: "inventada" },
      { ...assertion.citation, start: -1 },
      { ...assertion.citation, end: 999 },
      { ...assertion.citation, quote: "200 bultos" },
    ];
    for (const citation of citations) {
      expect(evaluateAlc({ ...input, claims: [{ ...claim, assertions: [{ ...assertion, citation }] }] }))
        .toEqual({ status: "technical_failure", code: ALC_TECHNICAL.CITATION });
    }
    expect(evaluateAlc({ ...input, claims: [{ ...claim, assertions: [{ ...assertion, value: "999" }] }] }))
      .toEqual({ status: "technical_failure", code: ALC_TECHNICAL.CITATION });
  });

  it("no convierte unidades ni interpreta separadores ambiguos", () => {
    const input = fixture();
    expect(evaluateAlc({ ...input, claims: [{ ...input.claims[0], unit: "bultos" }] })).toMatchObject({ color: ALC_COLOR.RED });
    expect(evaluateAlc({ ...input, claims: [{ ...input.claims[0], unit: null }] })).toMatchObject({ color: ALC_COLOR.RED });
    expect(evaluateAlc({ ...input, claims: [{ ...input.claims[0], value: "2,00" }] })).toMatchObject({ color: ALC_COLOR.RED });
  });

  it("no admite un valor extraído como subcadena de otra cantidad", () => {
    const input = fixture(["1200"]);
    const claim = input.claims[0];
    expect(evaluateAlc({ ...input, claims: [{ ...claim, assertions: [{ ...claim.assertions[0], value: "200" }] }] }))
      .toEqual({ status: "technical_failure", code: ALC_TECHNICAL.CITATION });
  });

  it("normaliza decimales exactos sin perder precisión ni usar floats", () => {
    const input = fixture(["0200.000"]);
    expect(evaluateAlc(input)).toMatchObject({ color: ALC_COLOR.GREEN });
  });

  it("no mezcla cantidades de ítems distintos", () => {
    const input = fixture(["200", "198"]);
    const first = input.claims[0];
    expect(evaluateAlc({ ...input, claims: [
      { ...first, assertions: [first.assertions[0]] },
      { ...first, id: "other", subject: "entrega/ítem-2", value: "198", assertions: [first.assertions[1]] },
    ] })).toMatchObject({ color: ALC_COLOR.GREEN });
  });

  it("la serialización del resultado no depende del orden de fuentes ni afirmaciones", () => {
    const input = fixture(["200", "198", "200"]);
    const reversed = { ...input, sources: [...input.sources].reverse(), claims: input.claims.map((claim) => ({ ...claim, assertions: [...claim.assertions].reverse() })) };
    expect(JSON.stringify(evaluateAlc(input))).toBe(JSON.stringify(evaluateAlc(reversed)));
  });

  it("no acepta IDs duplicados que permitan esconder una fuente o un concepto", () => {
    const input = fixture();
    expect(evaluateAlc({ ...input, sources: [...input.sources, input.sources[0]] })).toMatchObject({ status: "technical_failure" });
    expect(evaluateAlc({ ...input, claims: [...input.claims, input.claims[0]] })).toMatchObject({ status: "technical_failure" });
  });
});
