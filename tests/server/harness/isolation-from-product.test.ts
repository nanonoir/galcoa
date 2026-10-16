import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * El alias de `server-only` y el puente de test no existen fuera de la configuración de
 * test (MVP-120; data-transactions §7). Comprobación estática del repositorio real.
 */

const root = path.resolve(import.meta.dirname, "..", "..", "..");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : /\.(?:[cm]?[tj]sx?)$/.test(name) ? [full] : [];
  });
}

/** Especificadores de import/export/require/import() reales; los comentarios y cadenas sueltas no cuentan. */
function runtimeSpecifiers(text: string, file: string): string[] {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      found.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) found.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind));
  return found;
}

const isTestOnlySpecifier = (specifier: string) => /tests\/server|server-only-sentinel|galcoa-tests|(?:^|\/)tests\//.test(specifier);

describe("producto aislado del harness", () => {
  it("la configuración de Next no alias `server-only` ni referencia tests", () => {
    const next = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(next).not.toMatch(/server-only|tests\/|alias/);
  });

  it("ningún archivo de src/ importa tests/, el puente, el centinela ni el caché generado", () => {
    for (const file of listSources(path.join(root, "src"))) {
      const offending = runtimeSpecifiers(readFileSync(file, "utf8"), file).filter(isTestOnlySpecifier);
      expect(offending, path.relative(root, file)).toEqual([]);
    }
  });

  it("el detector ignora comentarios y cadenas, y rechaza imports reales", () => {
    const detect = (source: string) => runtimeSpecifiers(source, "x.ts").filter(isTestOnlySpecifier);
    expect(detect('// ver tests/server/documents\n/* tests/server-only-sentinel */\nconst a = "tests/server";')).toEqual([]);
    expect(detect('import x from "../../../tests/server/support/x";')).toEqual(["../../../tests/server/support/x"]);
    expect(detect('export * from "@/../tests/server/y";')).toEqual(["@/../tests/server/y"]);
    expect(detect('const m = await import("./server-only-sentinel");')).toEqual(["./server-only-sentinel"]);
    expect(detect('const r = require("galcoa-tests/x");')).toEqual(["galcoa-tests/x"]);
  });

  it("el producto conserva el import real de server-only (el centinela no lo reemplaza en src/)", () => {
    const gemini = readFileSync(path.join(root, "src", "lib", "ai", "gemini", "structured.ts"), "utf8");
    expect(gemini).toMatch(/^import "server-only";/m);
  });

  it("el alias del centinela vive solo en configuraciones de test", () => {
    const holders = ["vitest.config.ts", "vitest.server-local.config.ts", path.join("tests", "server", "bridge", "build.ts")];
    const configs = readdirSync(root).filter((name) => /\.(?:config|setup)\.[cm]?[tj]s$|^(?:vite|vitest|next|playwright)\.config/.test(name));
    for (const name of configs) {
      const mentions = /server-only-sentinel/.test(readFileSync(path.join(root, name), "utf8"));
      expect(mentions, name).toBe(holders.includes(name));
    }
  });
});
