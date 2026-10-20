import { ALC_BLOCK, ALC_COLOR, ALC_OUTCOME, ALC_READING, ALC_RULE, ALC_RULES_VERSION, ALC_SOURCE_KIND, ALC_TECHNICAL, type AlcBlockCode, type AlcColor, type AlcFinding, type AlcInput, type AlcResult, type AlcTechnical } from "@/lib/contracts/alc";

/** Contrato de escritura nuevo. Los lectores de revisiones históricas no cambian. */
export function validAlcSelection(selection: readonly string[]): boolean {
  return (selection.length === 2 && selection[0] === "autor" && selection[1] === "comprador")
    || (selection.length === 3 && selection[0] === "autor" && selection[1] === "intermediario" && selection[2] === "comprador");
}

/** Solo representación decimal: no tolerancias, separadores de miles ni conversiones. */
function decimal(value: string): string | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const tail = fraction.replace(/0+$/, "");
  const magnitude = tail ? `${integer}.${tail}` : integer;
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
}

const technical = (code: AlcTechnical): AlcResult => ({ status: ALC_OUTCOME.TECHNICAL, code });

function literalInQuote(value: string, quote: string, numeric: boolean): boolean {
  if (!numeric) return quote.includes(value);
  // Un valor propuesto «200» no puede validarse contra una cita que dice «1200».
  // Comas y puntos contiguos se conservan como parte del token, no se interpretan.
  const tokens: readonly string[] = quote.match(/-?\d+(?:[.,]\d+)*/g) ?? [];
  return tokens.includes(value);
}

/**
 * Pura: sin red, reloj, IA ni severidades de reportes. Consume hechos con procedencia
 * admitidos por servidor; por sí sola NO demuestra completitud del inventario SQL.
 */
export function evaluateAlc(input: AlcInput): AlcResult {
  if (!input.documentId || !Number.isSafeInteger(input.draftRevision) || input.draftRevision < 0) {
    return technical(ALC_TECHNICAL.INPUT);
  }
  if (!input.inventoryComplete) return technical(ALC_TECHNICAL.INVENTORY);
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  if (sources.size !== input.sources.length || input.sources.some((source) =>
    !source.id || !source.originalId || !/^[a-f0-9]{64}$/.test(source.hash)
    || !Object.values(ALC_SOURCE_KIND).includes(source.kind)
    || !Object.values(ALC_READING).includes(source.reading))) {
    return technical(ALC_TECHNICAL.SOURCE);
  }
  if (input.sources.some((source) => source.reading === ALC_READING.PENDING || source.reading === ALC_READING.ERROR)) {
    return technical(ALC_TECHNICAL.READING);
  }
  const findings: AlcFinding[] = [];
  let red = false;
  let yellow = false;
  const add = (ruleId: AlcFinding["ruleId"], claimId: string | null, sourceIds: readonly string[]) => {
    findings.push({ ruleId, claimId, sourceIds: [...new Set(sourceIds)].sort() });
  };
  if (!validAlcSelection(input.selection)) {
    red = true;
    add(ALC_RULE.PARTICIPANTS, null, []);
  }
  for (const source of input.sources) {
    if (source.reading === ALC_READING.UNREADABLE) {
      red = true;
      add(ALC_RULE.UNREADABLE, null, [source.id]);
    }
  }
  if (!input.contentCoverageComplete || input.claims.length === 0) {
    red = true;
    add(ALC_RULE.AMBIGUITY, null, []);
  }
  const claimIds = new Set<string>();
  const concepts = new Set<string>();
  for (const claim of input.claims) {
    const concept = JSON.stringify([claim.subject, claim.field]);
    if (!claim.id || !claim.subject || !claim.field || !claim.value || claimIds.has(claim.id) || concepts.has(concept)) {
      return technical(ALC_TECHNICAL.CLAIM);
    }
    claimIds.add(claim.id);
    concepts.add(concept);
    let ambiguous = claim.ambiguous || (claim.numeric && (!claim.unit || decimal(claim.value) === null));
    let contradiction = false;
    let corroborated = false;
    const refs: string[] = [];
    for (const assertion of claim.assertions) {
      const { citation } = assertion;
      const source = sources.get(citation.sourceId);
      if (!source || source.reading !== ALC_READING.READABLE
        || !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
        || citation.start < 0 || citation.end <= citation.start || citation.end > source.text.length
        || !citation.quote || source.text.slice(citation.start, citation.end) !== citation.quote
        || !assertion.value || !literalInQuote(assertion.value, citation.quote, claim.numeric)
        || (assertion.unit !== null && (!assertion.unit || !citation.quote.includes(assertion.unit)))) {
        return technical(ALC_TECHNICAL.CITATION);
      }
      refs.push(source.id);
      const expected = claim.numeric ? decimal(claim.value) : claim.value;
      const actual = claim.numeric ? decimal(assertion.value) : assertion.value;
      if (claim.unit !== assertion.unit || actual === null) ambiguous = true;
      else if (expected !== actual) contradiction = true;
      else if (source.kind === ALC_SOURCE_KIND.EVIDENCE) corroborated = true;
    }
    if (contradiction) {
      red = true;
      add(ALC_RULE.CONTRADICTION, claim.id, refs);
    }
    if (ambiguous) {
      red = true;
      add(ALC_RULE.AMBIGUITY, claim.id, refs);
    }
    if (!contradiction && !ambiguous) {
      if (corroborated) add(ALC_RULE.MATCHING, claim.id, refs);
      else {
        yellow = true;
        add(ALC_RULE.DECLARED, claim.id, refs);
      }
    }
  }
  findings.sort((a, b) => {
    const left = JSON.stringify([a.ruleId, a.claimId, a.sourceIds]);
    const right = JSON.stringify([b.ruleId, b.claimId, b.sourceIds]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return {
    status: ALC_OUTCOME.EVALUATED, rulesVersion: ALC_RULES_VERSION,
    color: red ? ALC_COLOR.RED : yellow ? ALC_COLOR.YELLOW : ALC_COLOR.GREEN, findings,
  };
}

/**
 * Sellabilidad de una revisión: solo una evaluación vigente, verde o amarilla,
 * con selección válida. Espeja la guarda SQL; el rojo y la falta de evaluación
 * bloquean sin posibilidad de "aprobar igual".
 */
export function alcBlock(input: {
  evaluation: { color: AlcColor; current: boolean } | null;
  selection: readonly string[];
}): AlcBlockCode | null {
  if (!input.evaluation) return ALC_BLOCK.EVALUATION_REQUIRED;
  if (!input.evaluation.current) return ALC_BLOCK.STALE_EVALUATION;
  if (!validAlcSelection(input.selection)) return ALC_BLOCK.SELECTION_INVALID;
  return input.evaluation.color === ALC_COLOR.RED ? ALC_BLOCK.RED : null;
}