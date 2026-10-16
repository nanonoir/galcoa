import path from "node:path";

import { createServer, resolveConfig } from "vite";
import { afterEach, describe, expect, it } from "vitest";

const configFile = path.resolve(import.meta.dirname, "..", "..", "preview", "vite.config.ts");
// Marcadores ficticios: el test fija su propio entorno y nunca lee archivos .env.
const MARKER = "galcoa-env-marker-7f3a";

describe("preview: configuración Vite", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it("en development usa loopback, puerto fijo estricto, sin env y sin prefijos públicos", async () => {
    const config = await resolveConfig({ configFile }, "serve", "development");
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.port).toBe(4173);
    expect(config.server.strictPort).toBe(true);
    expect(config.envDir).toBe(false);
    expect(config.envPrefix).toEqual([]);
    expect(config.build.outDir).toBeDefined();
  });

  it.each([
    ["build", () => resolveConfig({ configFile }, "build", "production")],
    ["modo production en serve", () => resolveConfig({ configFile }, "serve", "production")],
    ["vite preview", () => resolveConfig({ configFile, }, "serve", "development", "development", true)],
  ])("rechaza %s", async (_name, run) => {
    await expect(run()).rejects.toThrow(/solo existe como servidor de desarrollo/);
  });

  it("rechaza exponer el servidor fuera de loopback", async () => {
    await expect(resolveConfig({ configFile, server: { host: "0.0.0.0" } }, "serve", "development")).rejects.toThrow(/loopback/);
  });

  it("no inyecta variables del entorno del proceso en lo que sirve", async () => {
    process.env.VITE_GALCOA_MARKER = MARKER;
    process.env.GALCOA_PLAIN_MARKER = MARKER;
    try {
      const server = await createServer({ configFile, server: { port: 0, strictPort: false }, logLevel: "silent" });
      closers.push(() => server.close());
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") throw new Error("Sin dirección de escucha");
      expect(address.address).toBe("127.0.0.1");
      const base = `http://127.0.0.1:${address.port}`;

      for (const url of ["/", "/main.tsx", "/preview-app.tsx", "/registry.ts", "/@vite/env"]) {
        const response = await fetch(base + url);
        expect(response.status, url).toBe(200);
        expect(await response.text(), url).not.toContain(MARKER);
      }
      // Archivos de entorno y raíz del repositorio no se sirven.
      expect((await fetch(`${base}/@fs/${path.resolve(import.meta.dirname, "..", "..", "package.json").replaceAll("\\", "/")}`)).status).toBe(403);
    } finally {
      delete process.env.VITE_GALCOA_MARKER;
      delete process.env.GALCOA_PLAIN_MARKER;
    }
  });
});
