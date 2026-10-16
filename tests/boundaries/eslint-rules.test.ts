import { createRequire } from "node:module";
import path from "node:path";

import importPlugin from "eslint-plugin-import";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import { afterEach, describe, expect, it } from "vitest";

import { createBoundaryConfigs } from "./manifest.mjs";
import { createProject, removeProject } from "./project";

const require = createRequire(import.meta.url);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) removeProject(root);
});

/** Lint con las reglas reales del manifiesto sobre un proyecto temporal con resolución TypeScript. */
async function lint(files: Record<string, string>, target: string): Promise<string[]> {
  const root = createProject(files);
  roots.push(root);
  const config: Linter.Config[] = [
    {
      files: ["**/*.{ts,tsx}"],
      plugins: { import: importPlugin as never },
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      settings: {
        "import/resolver": {
          [require.resolve("eslint-import-resolver-typescript")]: { project: path.join(root, "tsconfig.json") },
        },
      },
    },
    ...createBoundaryConfigs({ basePath: root }),
  ];
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintFiles([target]);
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
}

const base = {
  "src/lib/contracts/doc.ts": 'import { z } from "zod";\nexport const D = z.string();\n',
  "src/lib/supabase/client.ts": 'import "server-only";\nexport const client = {};\n',
  "src/mocks/m.ts": 'import { D } from "@/lib/contracts/doc";\nexport const m = D;\n',
  "src/features/dash/fixtures/f.ts": "export const f = 1;\n",
  "src/features/dash/containers/c.tsx": "export const C = () => null;\n",
  "src/app/page.tsx": "export default function P() { return null; }\n",
  "src/lib/helper.ts": 'export * from "./supabase/client";\n',
  "src/components/ui/button.tsx": "export const B = () => null;\n",
  "src/lib/utils.ts": "export const cn = () => '';\n",
  "src/features/dash/components/sibling.tsx": "export const S = () => null;\n",
};

const comp = "src/features/dash/components/probe.tsx";

describe("ESLint: presentación", () => {
  it("acepta imports permitidos (alias y relativos)", async () => {
    const messages = await lint(
      {
        ...base,
        [comp]:
          'import { D } from "@/lib/contracts/doc";\nimport { B } from "@/components/ui/button";\nimport { cn } from "../../../lib/utils";\nimport { S } from "./sibling";\nexport const P = () => <i>{String(D)}{cn()}<B /><S /></i>;\n',
      },
      comp,
    );
    expect(messages).toEqual([]);
  });

  it.each([
    ["alias a servidor", 'import { client } from "@/lib/supabase/client";'],
    ["ruta relativa a servidor", 'import { client } from "../../../lib/supabase/client";'],
    ["helper intermedio con reexport", 'import { client } from "@/lib/helper";'],
    ["reexport directo", 'export { client } from "@/lib/supabase/client";'],
    ["export *", 'export * from "../../../lib/supabase/client";'],
    ["mocks compartidos", 'import { m } from "@/mocks/m";'],
    ["fixtures", 'import { f } from "../fixtures/f";'],
    ["containers", 'import { C } from "../containers/c";'],
    ["app", 'import P from "@/app/page";'],
    ["next", 'import Link from "next/link";'],
    ["SDK", 'import { createClient } from "@supabase/supabase-js";'],
    ["builtin de Node", 'import fs from "node:fs";'],
    ["import dinámico", 'const x = () => import("@/lib/supabase/client");'],
    ["require", 'const x = require("@/lib/supabase/client");'],
    ["fetch", 'const x = () => fetch("/api");'],
    ["process.env", "const x = process.env.SECRET;"],
    ["import.meta.env", "const x = import.meta.env;"],
  ])("rechaza %s", async (_name, line) => {
    const messages = await lint({ ...base, [comp]: `${line}\nexport const P = () => null;\n` }, comp);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("los tests de presentación pueden usar fixtures y mocks, no servidor", async () => {
    const test = "src/features/dash/components/probe.test.tsx";
    const ok = await lint({ ...base, [test]: 'import { f } from "../fixtures/f";\nimport { m } from "@/mocks/m";\nexport const t = [f, m];\n' }, test);
    expect(ok).toEqual([]);
    const bad = await lint({ ...base, [test]: 'import { client } from "@/lib/supabase/client";\nexport const t = client;\n' }, test);
    expect(bad.length).toBeGreaterThan(0);
  });
});

describe("ESLint: contratos, producto y preview", () => {
  it("contratos: aceptan Zod y otros contratos; rechazan React, Next, entorno y otros módulos", async () => {
    const file = "src/lib/contracts/new.ts";
    expect(await lint({ ...base, [file]: 'import { D } from "./doc";\nexport const N = D;\n' }, file)).toEqual([]);
    for (const line of ['import React from "react";', 'import "next/headers";', 'import { client } from "@/lib/supabase/client";', "const x = process.env.X;"]) {
      const messages = await lint({ ...base, [file]: `${line}\nexport const N = 1;\n` }, file);
      expect(messages.length, line).toBeGreaterThan(0);
    }
  });

  it("producto: no importa mocks, fixtures ni preview", async () => {
    const files = { ...base, "preview/main.tsx": "export const M = 1;\n" };
    for (const [file, line] of [
      ["src/app/x.tsx", 'import { m } from "@/mocks/m";'],
      ["src/lib/x.ts", 'import { f } from "@/features/dash/fixtures/f";'],
      ["src/features/dash/containers/x.tsx", 'import { M } from "../../../../preview/main";'],
    ] as const) {
      const messages = await lint({ ...files, [file]: `${line}\nexport const X = 1;\n` }, file);
      expect(messages.length, file).toBeGreaterThan(0);
    }
    const ok = "src/app/ok.tsx";
    expect(await lint({ ...files, [ok]: 'import { client } from "@/lib/supabase/client";\nexport const X = client;\n' }, ok)).toEqual([]);
  });

  it("mocks: solo dependen de contratos", async () => {
    const file = "src/mocks/n.ts";
    expect(await lint({ ...base, [file]: 'import { D } from "@/lib/contracts/doc";\nexport const n = D;\n' }, file)).toEqual([]);
    expect((await lint({ ...base, [file]: 'import { client } from "@/lib/supabase/client";\nexport const n = client;\n' }, file)).length).toBeGreaterThan(0);
  });

  it("preview: acepta presentación y mocks; rechaza app, containers y servicios", async () => {
    const file = "preview/main.tsx";
    expect(await lint({ ...base, [file]: 'import { m } from "@/mocks/m";\nimport { S } from "@/features/dash/components/sibling";\nexport const M = [m, S];\n' }, file)).toEqual([]);
    for (const line of ['import P from "@/app/page";', 'import { C } from "@/features/dash/containers/c";', 'import { client } from "@/lib/supabase/client";']) {
      const messages = await lint({ ...base, [file]: `${line}\nexport const M = 1;\n` }, file);
      expect(messages.length, line).toBeGreaterThan(0);
    }
  });
});

describe("ESLint real del repositorio", () => {
  it("aplica las barreras a un archivo de presentación", async () => {
    const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, "..", "..") });
    const config = (await eslint.calculateConfigForFile("src/features/dashboard/components/x.tsx")) as Linter.Config;
    expect((config.rules?.["import/no-restricted-paths"] as unknown[])[0]).toBe(2);
    expect((config.rules?.["no-restricted-imports"] as unknown[])[0]).toBe(2);
  });
});
