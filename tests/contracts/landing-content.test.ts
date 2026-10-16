import { describe, expect, it } from "vitest";

import { buildLandingContent } from "@/features/marketing/containers/landing-content";

const FORBIDDEN = /certificad|validad[oa] regulatoriamente|garantizad[oa] verdader|firma digital|identidad verificada/i;

describe("buildLandingContent (MVP-116/I4)", () => {
  it("visitante: registro y acceso reales, sin enlaces al panel", () => {
    const c = buildLandingContent(false);
    expect(c.primaryAction.href).toBe("/registro");
    expect(c.navigation.map((l) => l.href)).toContain("/acceso");
    expect(c.navigation.map((l) => l.href)).not.toContain("/dashboard");
  });

  it("con sesión: la acción principal lleva al panel", () => {
    const c = buildLandingContent(true);
    expect(c.primaryAction.href).toBe("/dashboard");
    expect(c.navigation.map((l) => l.href)).toContain("/dashboard");
  });

  it("las tres características venden control, respaldo y trazabilidad", () => {
    for (const signedIn of [false, true]) {
      expect(buildLandingContent(signedIn).features.map((f) => f.title)).toEqual(["Control de calidad", "Respaldo", "Trazabilidad"]);
    }
  });

  it("no usa términos prohibidos (PRD §5, §11)", () => {
    for (const signedIn of [false, true]) expect(JSON.stringify(buildLandingContent(signedIn))).not.toMatch(FORBIDDEN);
  });
});
