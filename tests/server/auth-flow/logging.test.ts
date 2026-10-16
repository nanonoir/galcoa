import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("Logs de peticiones de Auth en desarrollo", () => {
  const incoming = nextConfig.logging && nextConfig.logging.incomingRequests;
  const ignore = incoming && typeof incoming === "object" ? incoming.ignore : [];

  it.each([
    "/api/auth/callback",
    "/api/auth/callback?flow=signup&code=codigo-ficticio",
    "/api/auth/callback?code=codigo-ficticio&flow=recovery",
  ])("excluye el callback con su query: %s", (url) => {
    expect(ignore?.some((pattern) => pattern.test(url))).toBe(true);
  });

  it.each(["/", "/acceso", "/api/auth/login", "/api/auth/recovery", "/otra?next=/api/auth/callback"])(
    "conserva los logs de otras rutas: %s",
    (url) => {
      expect(ignore?.some((pattern) => pattern.test(url))).toBe(false);
    },
  );
});
