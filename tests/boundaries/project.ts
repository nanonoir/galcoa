import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Proyecto temporal con la misma forma de alias que el repositorio (`@/*` → `src/*`). */
export function createProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "galcoa-boundaries-"));
  const all: Record<string, string> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src/**/*", "preview/**/*"],
    }),
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

export function removeProject(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}
