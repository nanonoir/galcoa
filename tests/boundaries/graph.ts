import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import {
  NETWORK_AND_ENV_GLOBALS,
  contractPackages,
  presentationPackages,
  previewPackages,
  SERVER_DIRS,
} from "./manifest.mjs";

/**
 * Análisis de dependencias con la resolución real de TypeScript (alias,
 * relativas, reexports). Sigue el cierre transitivo desde cada archivo
 * protegido, así un helper intermedio no permite eludir una barrera.
 */

export interface Violation {
  file: string;
  rule: string;
  detail: string;
}

interface Edge {
  specifier: string;
  /** Archivo del proyecto al que resuelve, o null si es un paquete/no resuelve. */
  target: string | null;
  isPackage: boolean;
  unresolved: boolean;
}

interface FileInfo {
  edges: Edge[];
  globals: string[];
  dynamicNonLiteral: boolean;
  importsServerOnly: boolean;
}

const ASSET_EXT = /\.(?:css|svg|png|jpe?g|gif|webp|ico|woff2?|json)$/;
const SOURCE_EXT = /\.(?:[cm]?[tj]sx?)$/;

const toPosix = (p: string) => p.split(path.sep).join("/");

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, ".*");
  return new RegExp(`^${escaped.replace(/\u0000/g, ".*")}$`);
}

function matchesAny(value: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(value));
}

export const isTestFile = (rel: string) => /\.(?:test|spec)\.tsx?$/.test(rel);

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listFiles(full);
    return SOURCE_EXT.test(entry.name) ? [full] : [];
  });
}

export class ProjectGraph {
  readonly root: string;
  private readonly options: ts.CompilerOptions;
  private readonly cache = new Map<string, FileInfo>();

  constructor(root: string) {
    this.root = path.resolve(root);
    const configPath = path.join(this.root, "tsconfig.json");
    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    if (raw.error) throw new Error(`No se pudo leer ${configPath}`);
    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, this.root);
    this.options = parsed.options;
  }

  rel(file: string): string {
    return toPosix(path.relative(this.root, file));
  }

  /** Archivos fuente bajo las carpetas relativas indicadas. */
  files(...dirs: string[]): string[] {
    return dirs.flatMap((d) => listFiles(path.join(this.root, d)));
  }

  info(file: string): FileInfo {
    const cached = this.cache.get(file);
    if (cached) return cached;
    const info = this.analyze(file);
    this.cache.set(file, info);
    return info;
  }

  private analyze(file: string): FileInfo {
    const text = fs.readFileSync(file, "utf8");
    const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const specifiers: string[] = [];
    const globals: string[] = [];
    let dynamicNonLiteral = false;
    let importsServerOnly = false;
    const globalSet = new Set<string>(NETWORK_AND_ENV_GLOBALS);

    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
        if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "server-only") importsServerOnly = true;
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
        specifiers.push(node.moduleReference.expression.text);
      } else if (ts.isCallExpression(node)) {
        const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isDynamic || isRequire) {
          const arg = node.arguments[0];
          if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) specifiers.push(arg.text);
          else dynamicNonLiteral = true;
        }
      } else if (ts.isIdentifier(node) && globalSet.has(node.text)) {
        const parent = node.parent;
        const isMemberName = ts.isPropertyAccessExpression(parent) && parent.name === node;
        const isDeclaration = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isImportSpecifier(parent) || ts.isBindingElement(parent)) && (parent as { name?: ts.Node }).name === node;
        if (!isMemberName && !isDeclaration) globals.push(node.text);
      } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
        globals.push("import.meta");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    const edges = specifiers.map((specifier): Edge => {
      const resolved = ts.resolveModuleName(specifier, file, this.options, ts.sys).resolvedModule;
      if (resolved && !resolved.isExternalLibraryImport && SOURCE_EXT.test(resolved.resolvedFileName)) {
        return { specifier, target: path.normalize(resolved.resolvedFileName), isPackage: false, unresolved: false };
      }
      if (resolved) return { specifier, target: null, isPackage: true, unresolved: false };
      const looksLocal = (specifier.startsWith(".") || specifier.startsWith("@/")) && !ASSET_EXT.test(specifier);
      return { specifier, target: null, isPackage: !looksLocal, unresolved: looksLocal };
    });
    return { edges, globals, dynamicNonLiteral, importsServerOnly };
  }

  /** Archivos del proyecto alcanzables desde `entry` (incluye `entry`), con la cadena que llega a cada uno. */
  closure(entry: string): Map<string, string[]> {
    const seen = new Map<string, string[]>([[entry, [entry]]]);
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of this.info(current).edges) {
        if (edge.target && !seen.has(edge.target)) {
          seen.set(edge.target, [...(seen.get(current) as string[]), edge.target]);
          queue.push(edge.target);
        }
      }
    }
    return seen;
  }
}

interface Surface {
  name: string;
  entries: (g: ProjectGraph) => string[];
  /** Un archivo alcanzado debe cumplir esto (ruta relativa con «/»). */
  allows?: (rel: string) => boolean;
  forbiddenPackages: readonly string[];
  forbidGlobals: boolean;
}

const PRESENTATION_GLOB = ["src/features"];
const isPresentation = (rel: string) => /^src\/features\/[^/]+\/components\//.test(rel);

const PURE_ALLOWED = (rel: string) =>
  rel.startsWith("src/lib/contracts/") ||
  /^src\/features\/[^/]+\/contracts\//.test(rel) ||
  rel.startsWith("src/components/ui/") ||
  rel === "src/lib/utils.ts" ||
  isPresentation(rel);

const surfaces: Surface[] = [
  {
    name: "presentación",
    entries: (g) => g.files(...PRESENTATION_GLOB).filter((f) => isPresentation(g.rel(f)) && !isTestFile(g.rel(f))),
    allows: PURE_ALLOWED,
    forbiddenPackages: presentationPackages,
    forbidGlobals: true,
  },
  {
    name: "contratos",
    entries: (g) => g.files("src/lib/contracts"),
    allows: (rel) => rel.startsWith("src/lib/contracts/"),
    forbiddenPackages: contractPackages,
    forbidGlobals: true,
  },
  {
    name: "preview",
    // vite.config.ts es herramienta de Node, no código que llega al navegador.
    entries: (g) => g.files("preview").filter((f) => g.rel(f) !== "preview/vite.config.ts" && !isTestFile(g.rel(f))),
    allows: (rel) =>
      !/^src\/app\//.test(rel) &&
      !/^src\/features\/[^/]+\/containers\//.test(rel) &&
      !/^src\/lib\/(supabase|ai|documents|hedera|rules)\//.test(rel),
    forbiddenPackages: previewPackages,
    forbidGlobals: false,
  },
  {
    name: "producto",
    entries: (g) =>
      g.files("src").filter((f) => {
        const rel = g.rel(f);
        return !rel.startsWith("src/mocks/") && !/^src\/features\/[^/]+\/fixtures\//.test(rel) && !isTestFile(rel);
      }),
    allows: (rel) => !rel.startsWith("src/mocks/") && !rel.startsWith("preview/") && !/^src\/features\/[^/]+\/fixtures\//.test(rel),
    forbiddenPackages: [],
    forbidGlobals: false,
  },
];

/** Comprueba todas las barreras del grafo de `root` y devuelve las violaciones. */
export function checkBoundaries(root: string): Violation[] {
  const graph = new ProjectGraph(root);
  const violations: Violation[] = [];
  const reported = new Set<string>();
  const add = (v: Violation) => {
    const key = `${v.file}|${v.rule}|${v.detail}`;
    if (!reported.has(key)) {
      reported.add(key);
      violations.push(v);
    }
  };

  for (const surface of surfaces) {
    const forbiddenPackage = (spec: string) => matchesAny(spec, surface.forbiddenPackages);
    for (const entry of surface.entries(graph)) {
      for (const [file, chain] of graph.closure(entry)) {
        const rel = graph.rel(file);
        const via = chain.map((c) => graph.rel(c)).join(" → ");
        if (surface.allows && !surface.allows(rel)) {
          add({ file: graph.rel(entry), rule: surface.name, detail: `importa ${rel} (${via})` });
        }
        const info = graph.info(file);
        for (const edge of info.edges) {
          if (edge.unresolved) add({ file: graph.rel(entry), rule: surface.name, detail: `import no resuelto «${edge.specifier}» en ${rel}` });
          if (edge.isPackage && forbiddenPackage(edge.specifier)) add({ file: graph.rel(entry), rule: surface.name, detail: `paquete prohibido «${edge.specifier}» en ${rel} (${via})` });
        }
        if (surface.forbidGlobals) {
          for (const name of info.globals) add({ file: graph.rel(entry), rule: surface.name, detail: `uso de «${name}» en ${rel}` });
          if (info.dynamicNonLiteral) add({ file: graph.rel(entry), rule: surface.name, detail: `import dinámico no analizable en ${rel}` });
        }
      }
    }
  }

  // server-only: cada archivo de carpetas de servidor existentes lo importa.
  for (const dir of SERVER_DIRS) {
    for (const file of graph.files(dir)) {
      const rel = graph.rel(file);
      if (!isTestFile(rel) && !graph.info(file).importsServerOnly) add({ file: rel, rule: "server-only", detail: 'falta import "server-only"' });
    }
  }

  return violations;
}
