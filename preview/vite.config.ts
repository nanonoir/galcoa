import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Preview local de presentación (docs/architecture.md, «Preview local sin
 * credenciales»). Solo `vite serve` en development y solo loopback. No es un
 * build, no se despliega y no carga ni inyecta variables de entorno.
 */

const repoRoot = path.resolve(import.meta.dirname, "..");
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 4173;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Rechaza exponer el servidor fuera de loopback, p. ej. con `--host`. */
function loopbackOnly(): Plugin {
  return {
    name: "preview-loopback-only",
    configResolved(config) {
      const host = config.server.host;
      if (typeof host !== "string" || !LOOPBACK_HOSTS.has(host)) {
        throw new Error(`El preview solo escucha en loopback; host rechazado: ${String(host)}`);
      }
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => {
  if (command !== "serve" || isPreview || mode !== "development") {
    throw new Error("El preview solo existe como servidor de desarrollo (vite serve, mode development); no hay build ni vite preview.");
  }

  return {
    root: import.meta.dirname,
    publicDir: path.join(repoRoot, "public"),
    // Sin archivos .env, sin prefijos públicos y sin reemplazar process.env.
    envDir: false,
    envPrefix: [],
    plugins: [react(), tailwindcss(), loopbackOnly()],
    resolve: { alias: { "@": path.join(repoRoot, "src") } },
    server: {
      host: PREVIEW_HOST,
      port: PREVIEW_PORT,
      strictPort: true,
      open: false,
      // Solo lo necesario: preview, src y dependencias; nunca la raíz con .env.
      fs: { strict: true, allow: [import.meta.dirname, path.join(repoRoot, "src"), path.join(repoRoot, "node_modules")] },
    },
    optimizeDeps: { entries: ["main.tsx"] },
  };
});
