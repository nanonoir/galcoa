import { describe, expect, it } from "vitest";

import { AuthE2eConfigError, resolveAuthE2eEnv } from "../../e2e/auth-env";

const valid = {
  AUTH_E2E: "1",
  AUTH_E2E_SUPABASE_URL: "http://127.0.0.1:54321",
  AUTH_E2E_PUBLISHABLE_KEY: "clave-ficticia",
  AUTH_E2E_MAIL_URL: "http://127.0.0.1:54324",
};

describe("Configuración del E2E real de Auth (fallo explícito, no omisión silenciosa)", () => {
  it("sin AUTH_E2E=1 no se solicita la suite", () => {
    expect(resolveAuthE2eEnv({})).toBeNull();
    expect(resolveAuthE2eEnv({ ...valid, AUTH_E2E: "0" })).toBeNull();
  });

  it("con AUTH_E2E=1 y datos completos se ejecuta (puerto 3217 por defecto)", () => {
    expect(resolveAuthE2eEnv(valid)).toEqual({
      supabaseUrl: valid.AUTH_E2E_SUPABASE_URL,
      publishableKey: valid.AUTH_E2E_PUBLISHABLE_KEY,
      mailUrl: valid.AUTH_E2E_MAIL_URL,
      port: 3217,
    });
  });

  it.each([
    ["AUTH_E2E_SUPABASE_URL", undefined],
    ["AUTH_E2E_SUPABASE_URL", "no-es-url"],
    ["AUTH_E2E_PUBLISHABLE_KEY", "  "],
    ["AUTH_E2E_PUBLISHABLE_KEY", undefined],
    ["AUTH_E2E_MAIL_URL", undefined],
    ["AUTH_E2E_PORT", "abc"],
    ["AUTH_E2E_PORT", "80"],
  ])("AUTH_E2E=1 con %s=%s: error de configuración, no skip", (name, value) => {
    expect(() => resolveAuthE2eEnv({ ...valid, [name]: value })).toThrow(AuthE2eConfigError);
  });

  it("el mensaje nombra qué falta y no incluye valores", () => {
    try {
      resolveAuthE2eEnv({ AUTH_E2E: "1", AUTH_E2E_PUBLISHABLE_KEY: "clave-ficticia" });
      throw new Error("no lanzó");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthE2eConfigError);
      expect((error as Error).message).toContain("AUTH_E2E_SUPABASE_URL");
      expect((error as Error).message).not.toContain("clave-ficticia");
    }
  });
});
