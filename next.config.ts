import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E locales: caché/lock propios, sin competir con el dev server del usuario.
  ...(process.env.CONFIRM_E2E === "1" ? { distDir: ".next-e2e-confirm" }
    : process.env.REVIEW_E2E === "1" ? { distDir: ".next-e2e-review" } : {}),
  // Imagen Docker mínima (docs/DEPLOY-VPS.md); Vercel lo ignora.
  output: "standalone",
  logging: {
    incomingRequests: {
      // El token de invitación viaja en la ruta: no se registra en el log del framework.
      ignore: [/^\/api\/auth\/callback/, /^\/confirm\//, /^\/api\/confirm\//],
    },
  },
  async headers() {
    const privatePage = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [{ source: "/confirm/:path*", headers: privatePage }];
  },
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
