/**
 * Guards del bundle de test (MVP-120; data-transactions §7). Operan sobre el grafo de
 * módulos y los imports externos del artefacto, no sobre el texto del fuente: un helper
 * intermedio no los elude. Cada regla es explícita y tiene su caso negativo en los tests.
 */

export type BridgeChunk = {
  fileName: string;
  code: string;
  /** Imports externos estáticos (especificadores tal como quedaron en el artefacto). */
  imports: readonly string[];
  dynamicImports: readonly string[];
  /** Ids absolutos de los módulos incluidos en el bundle. */
  moduleIds: readonly string[];
};

/** Dependencias runtime externas permitidas: Auth/RPC local y utilidades de test. */
export const ALLOWED_RUNTIME_EXTERNALS: readonly (string | RegExp)[] = [
  /^node:/,
  "ai",
  "ai/test",
  "zod",
  "@supabase/supabase-js",
];

/** Paquetes que jamás deben entrar: marcador sin resolver, Next, adapters/SDK reales de IA/HCS/PDF. */
const FORBIDDEN_EXTERNALS: readonly RegExp[] = [
  /^server-only$/,
  /^next(\/|$)/,
  /^react(-dom)?(\/|$)/,
  /^@ai-sdk\//,
  /^groq-sdk$/,
  /^@hiero-ledger\//,
  /^@hashgraph\//,
  /^@react-pdf\//,
];

/** Módulos del proyecto/paquetes que no pueden formar parte del grafo. */
const FORBIDDEN_MODULES: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /[\\/]src[\\/]app[\\/]/, reason: "rutas/páginas de la app (src/app)" },
  { pattern: /[\\/]node_modules[\\/]next[\\/]/, reason: "Next empaquetado (p. ej. next/headers)" },
  { pattern: /[\\/]node_modules[\\/](?:@ai-sdk[\\/]google|groq-sdk|@hiero-ledger|@hashgraph|@react-pdf)[\\/]/, reason: "SDK real de proveedor empaquetado" },
];

const matches = (specifier: string, rule: string | RegExp) => (typeof rule === "string" ? specifier === rule : rule.test(specifier));

export function findBridgeViolations(chunks: readonly BridgeChunk[], allowed: readonly (string | RegExp)[] = ALLOWED_RUNTIME_EXTERNALS): string[] {
  const violations: string[] = [];
  for (const chunk of chunks) {
    for (const specifier of [...chunk.imports, ...chunk.dynamicImports]) {
      if (FORBIDDEN_EXTERNALS.some((rule) => rule.test(specifier))) {
        violations.push(`${chunk.fileName}: import externo prohibido «${specifier}»`);
      } else if (!allowed.some((rule) => matches(specifier, rule))) {
        violations.push(`${chunk.fileName}: dependencia runtime fuera de la lista permitida «${specifier}»`);
      }
    }
    for (const id of chunk.moduleIds) {
      const hit = FORBIDDEN_MODULES.find((rule) => rule.pattern.test(id));
      if (hit) violations.push(`${chunk.fileName}: el grafo incluye ${hit.reason}: ${id}`);
    }
    // Defensa adicional sobre el texto emitido: marcador sin resolver y next/headers.
    if (/(?:import|from)\s*["']server-only["']/.test(chunk.code)) violations.push(`${chunk.fileName}: import runtime de «server-only» sin resolver`);
    if (/(?:import|from)\s*["']next\/headers["']/.test(chunk.code)) violations.push(`${chunk.fileName}: import de «next/headers»`);
  }
  return violations;
}

export function assertBridgeGraph(chunks: readonly BridgeChunk[], allowed?: readonly (string | RegExp)[]): void {
  const violations = findBridgeViolations(chunks, allowed);
  if (violations.length > 0) throw new Error(`El bundle de test viola sus guards:\n- ${violations.join("\n- ")}`);
}
