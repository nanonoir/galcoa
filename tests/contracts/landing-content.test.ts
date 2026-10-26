import { describe, expect, it } from "vitest";

import { buildLandingContent } from "@/features/marketing/containers/landing-content";

const FORBIDDEN = /certificad|validad[oa] regulatoriamente|garantizad[oa] verdader|firma digital|identidad verificada/i;

describe("buildLandingContent (MVP-116/I4)", () => {
  it("visitante: la acción principal es la demo sin registro; la secundaria, el registro real", () => {
    const c = buildLandingContent(false);
    expect(c.primaryAction.href).toBe("/demo");
    expect(c.secondaryAction?.href).toBe("/registro?origen=landing");
    expect(c.navigation.map((l) => l.href)).toContain("/acceso");
    expect(c.navigation.map((l) => l.href)).not.toContain("/dashboard");
  });

  it("cuenta el problema y siempre ofrece ver los planes (conversión)", () => {
    for (const signedIn of [false, true]) {
      const c = buildLandingContent(signedIn);
      expect(c.problem?.points.length).toBeGreaterThan(0);
      expect(c.pricingTeaser?.link.href).toBe("/precios");
    }
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
