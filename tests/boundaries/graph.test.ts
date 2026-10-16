import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkBoundaries } from "./graph";
import { createProject, removeProject } from "./project";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const roots: string[] = [];

function check(files: Record<string, string>) {
  const root = createProject(files);
  roots.push(root);
  return checkBoundaries(root);
}

afterEach(() => {
  for (const root of roots.splice(0)) removeProject(root);
});

const contract = { "src/lib/contracts/doc.ts": 'import { z } from "zod";\nexport const D = z.string();\n' };

describe("grafo del repositorio real", () => {
  it("no tiene violaciones de barreras", () => {
    expect(checkBoundaries(repoRoot)).toEqual([]);
  });
});

describe("presentación: casos permitidos", () => {
  it("acepta contratos, components/ui, utils, contratos de feature y hermanos (alias y relativas)", () => {
    const violations = check({
      ...contract,
      "src/components/ui/button.tsx": 'import { cn } from "@/lib/utils";\nexport const B = () => cn("a");\n',
      "src/lib/utils.ts": 'export { cn } from "cn";\n',
      "src/features/dash/contracts/view.ts": 'import type { D } from "@/lib/contracts/doc";\nexport type V = typeof D;\n',
      "src/features/dash/components/row.tsx": 'import { B } from "@/components/ui/button";\nexport const Row = () => <B />;\n',
      "src/features/dash/components/list.tsx":
        'import { Row } from "./row";\nimport { D } from "../../../lib/contracts/doc";\nimport type { V } from "@/features/dash/contracts/view";\nexport const L = (p: { v?: V }) => <Row {...p} data-d={String(D)} />;\n',
    });
    expect(violations).toEqual([]);
  });
});

describe("presentación: casos rechazados", () => {
  const server = { "src/lib/supabase/client.ts": 'import "server-only";\nexport const client = {};\n' };

  it("rechaza import directo por alias", () => {
    const v = check({ ...server, "src/features/dash/components/a.tsx": 'import { client } from "@/lib/supabase/client";\nexport const A = () => <i>{String(client)}</i>;\n' });
    expect(v.some((x) => x.rule === "presentación" && x.detail.includes("src/lib/supabase/client.ts"))).toBe(true);
  });

  it("rechaza import por ruta relativa", () => {
    const v = check({ ...server, "src/features/dash/components/a.tsx": 'import { client } from "../../../lib/supabase/client";\nexport const A = () => <i>{String(client)}</i>;\n' });
    expect(v.some((x) => x.rule === "presentación")).toBe(true);
  });

  it("rechaza un helper intermedio que reexporta el servidor", () => {
    const v = check({
      ...server,
      "src/lib/helper.ts": 'export * from "./supabase/client";\n',
      "src/features/dash/components/a.tsx": 'import { client } from "@/lib/helper";\nexport const A = () => <i>{String(client)}</i>;\n',
    });
    expect(v.some((x) => x.detail.includes("src/lib/helper.ts"))).toBe(true);
  });

  it("rechaza el servidor alcanzado de forma transitiva a través de un archivo permitido", () => {
    const v = check({
      ...server,
      "src/features/dash/components/barrel.ts": 'export { client } from "@/lib/supabase/client";\n',
      "src/features/dash/components/a.tsx": 'import { client } from "./barrel";\nexport const A = () => <i>{String(client)}</i>;\n',
    });
    expect(v.some((x) => x.detail.includes("src/lib/supabase/client.ts"))).toBe(true);
  });

  it.each([
    ["next/image", 'import Image from "next/image";\nexport const A = () => <Image alt="" src="" />;\n'],
    ["@supabase/supabase-js", 'import { createClient } from "@supabase/supabase-js";\nexport const A = () => String(createClient);\n'],
    ["node:fs", 'import fs from "node:fs";\nexport const A = () => String(fs);\n'],
    ["server-only", 'import "server-only";\nexport const A = () => null;\n'],
  ])("rechaza el paquete %s", (pkg, source) => {
    const v = check({ "src/features/dash/components/a.tsx": source });
    expect(v.some((x) => x.detail.includes(pkg))).toBe(true);
  });

  it("rechaza fetch, process.env, import.meta y import dinámico no analizable", () => {
    const v = check({
      "src/features/dash/components/a.tsx": 'export const A = async (m: string) => { await fetch("/x"); void process.env.X; void import.meta; await import(m); return null; };\n',
    });
    const details = v.map((x) => x.detail).join("\n");
    expect(details).toContain("«fetch»");
    expect(details).toContain("«process»");
    expect(details).toContain("«import.meta»");
    expect(details).toContain("import dinámico no analizable");
  });

  it("rechaza app, containers y mocks compartidos", () => {
    const v = check({
      "src/app/page.tsx": "export default function P() { return null; }\n",
      "src/features/dash/containers/c.tsx": "export const C = () => null;\n",
      "src/mocks/x.ts": "export const m = 1;\n",
      "src/features/dash/components/a.tsx":
        'import P from "@/app/page";\nimport { C } from "../containers/c";\nimport { m } from "@/mocks/x";\nexport const A = () => <i>{String(P)}{String(C)}{m}</i>;\n',
    });
    const files = v.map((x) => x.detail).join("\n");
    expect(files).toContain("src/app/page.tsx");
    expect(files).toContain("src/features/dash/containers/c.tsx");
    expect(files).toContain("src/mocks/x.ts");
  });

  it("rechaza un import que no se puede resolver, en vez de ignorarlo", () => {
    const v = check({ "src/features/dash/components/a.tsx": 'import { x } from "@/lib/inexistente";\nexport const A = () => <i>{String(x)}</i>;\n' });
    expect(v.some((x) => x.detail.includes("no resuelto"))).toBe(true);
  });

  it("ignora tests de presentación como puntos de entrada (pueden usar fixtures)", () => {
    const v = check({
      ...contract,
      "src/features/dash/fixtures/f.ts": 'import { D } from "@/lib/contracts/doc";\nexport const f = D;\n',
      "src/features/dash/components/a.test.tsx": 'import { f } from "../fixtures/f";\nexport const t = f;\n',
    });
    expect(v).toEqual([]);
  });
});

describe.each(["documents", "marketing", "auth"])("dominio %s", (domain) => {
  const server = { "src/lib/supabase/client.ts": 'import "server-only";\nexport const client = {};\n' };

  it("acepta contrato de feature, presentación y preview con mocks", () => {
    const v = check({
      ...contract,
      [`src/features/${domain}/contracts/view.ts`]: 'import type { D } from "@/lib/contracts/doc";\nexport type V = typeof D;\n',
      [`src/features/${domain}/components/a.tsx`]: `import type { V } from "@/features/${domain}/contracts/view";\nexport const A = (p: { v?: V }) => <i>{String(p.v)}</i>;\n`,
      "src/mocks/m.ts": 'import { D } from "@/lib/contracts/doc";\nexport const m = D;\n',
      "preview/main.tsx": `import { A } from "@/features/${domain}/components/a";\nimport { m } from "@/mocks/m";\nexport const M = [A, m];\n`,
    });
    expect(v).toEqual([]);
  });

  it("rechaza servidor, Next, red y mocks en la presentación del dominio", () => {
    const v = check({
      ...server,
      "src/mocks/m.ts": "export const m = 1;\n",
      [`src/features/${domain}/components/a.tsx`]:
        'import { client } from "@/lib/supabase/client";\nimport Link from "next/link";\nimport { m } from "@/mocks/m";\nexport const A = () => { void fetch("/x"); return <Link href="/">{String(client)}{m}</Link>; };\n',
    });
    const details = v.map((x) => x.detail).join("\n");
    expect(details).toContain("src/lib/supabase/client.ts");
    expect(details).toContain("next/link");
    expect(details).toContain("src/mocks/m.ts");
    expect(details).toContain("«fetch»");
  });
});

describe("contratos", () => {
  it("rechaza React, Next, entorno y archivos fuera de contratos (también transitivos)", () => {
    const v = check({
      "src/lib/rules/r.ts": "export const r = 1;\n",
      "src/lib/shared.ts": 'import { r } from "./rules/r";\nexport const s = r;\n',
      "src/lib/contracts/a.ts": 'import React from "react";\nimport { s } from "../shared";\nexport const a = [React, s, process.env.X];\n',
    });
    const details = v.map((x) => x.detail).join("\n");
    expect(details).toContain("paquete prohibido «react»");
    expect(details).toContain("src/lib/shared.ts");
    expect(details).toContain("«process»");
  });
});

describe("preview", () => {
  it("rechaza app, containers y servicios, también por transitividad", () => {
    const v = check({
      "src/lib/documents/svc.ts": 'import "server-only";\nexport const svc = 1;\n',
      "src/features/dash/components/a.tsx": 'import { svc } from "@/lib/documents/svc";\nexport const A = () => <i>{svc}</i>;\n',
      "preview/main.tsx": 'import { A } from "@/features/dash/components/a";\nexport const M = A;\n',
    });
    expect(v.some((x) => x.rule === "preview" && x.detail.includes("src/lib/documents/svc.ts"))).toBe(true);
  });

  it("acepta presentación, mocks y contratos", () => {
    const v = check({
      ...contract,
      "src/mocks/m.ts": 'import { D } from "@/lib/contracts/doc";\nexport const m = D;\n',
      "src/features/dash/components/a.tsx": 'import { D } from "@/lib/contracts/doc";\nexport const A = () => <i>{String(D)}</i>;\n',
      "preview/main.tsx": 'import { A } from "@/features/dash/components/a";\nimport { m } from "@/mocks/m";\nexport const M = [A, m];\n',
    });
    expect(v).toEqual([]);
  });
});

describe("producto", () => {
  it("rechaza mocks, fixtures y preview en el código de producto (transitivo)", () => {
    const v = check({
      ...contract,
      "src/mocks/m.ts": 'import { D } from "@/lib/contracts/doc";\nexport const m = D;\n',
      "src/features/dash/fixtures/f.ts": "export const f = 1;\n",
      "src/lib/helper.ts": 'export * from "@/mocks/m";\n',
      "src/app/page.tsx": 'import { m } from "@/lib/helper";\nimport { f } from "@/features/dash/fixtures/f";\nexport default function P() { return <i>{String(m)}{f}</i>; }\n',
    });
    const details = v.map((x) => x.detail).join("\n");
    expect(details).toContain("src/mocks/m.ts");
    expect(details).toContain("src/features/dash/fixtures/f.ts");
  });
});

describe("server-only", () => {
  it("exige import en carpetas de servidor existentes y no inventa carpetas", () => {
    const v = check({ "src/lib/hedera/send.ts": "export const send = 1;\n" });
    expect(v).toEqual([{ file: "src/lib/hedera/send.ts", rule: "server-only", detail: 'falta import "server-only"' }]);
  });

  it("acepta archivos de servidor marcados", () => {
    expect(check({ "src/lib/ai/run.ts": 'import "server-only";\nexport const run = 1;\n' })).toEqual([]);
  });

  it("sin carpetas de servidor no hay violaciones", () => {
    expect(check({ "src/lib/utils.ts": "export const u = 1;\n" })).toEqual([]);
  });
});
