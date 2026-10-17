import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LandingContent } from "@/lib/contracts/landing";
import { landingScenarios } from "@/mocks/marketing";

import { LandingPage } from "./landing-page";

/** Términos que la UI nunca usa para lo que produce el sistema (PRD §5, §11). */
const FORBIDDEN = ["certificado", "validado regulatoriamente", "garantizado verdadero", "firma digital", "identidad verificada"];
/** Promesas fuera de P0 (PRD §1, §4). */
const OUT_OF_SCOPE = [/mainnet/i, /\bpago/i, /mercado pago/i, /stripe/i, /env[ií]o autom[aá]tico/i, /(?<!no )garantiza que .* verdader/i];

function scenarioContent(id: string): LandingContent {
  const scenario = landingScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.content;
}

describe("LandingPage (MVP-114)", () => {
  it("recorre todos los escenarios sin términos prohibidos ni promesas fuera de P0", () => {
    expect(landingScenarios.map((s) => s.id)).toEqual(["public", "signed-in"]);
    for (const scenario of landingScenarios) {
      const { container, unmount } = render(<LandingPage content={scenario.content} />);
      const text = (container.textContent ?? "").toLowerCase();
      for (const term of FORBIDDEN) expect(text, `${scenario.id}: «${term}»`).not.toContain(term);
      for (const pattern of OUT_OF_SCOPE) expect(text, `${scenario.id}: ${pattern}`).not.toMatch(pattern);
      unmount();
    }
  });

  it("encabezado sin atajos: solo la marca y la acción que recibe", () => {
    render(<LandingPage content={scenarioContent("signed-in")} headerAction={<button type="button">Cerrar sesión</button>} />);
    expect(screen.queryByRole("link", { name: "Cómo funciona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menú" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("estructura del wireframe: hero con acción principal, tres características y alcance con límites", () => {
    const content = scenarioContent("public");
    render(<LandingPage content={content} />);
    expect(screen.getByRole("heading", { level: 1, name: content.heading })).toBeInTheDocument();
    expect(screen.getByText(content.summary)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");

    const features = screen.getByRole("region", { name: "Cómo funciona" });
    expect(features).toHaveAttribute("id", "como-funciona");
    expect(within(features).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(content.features.map((f) => f.title));

    const scope = screen.getByRole("region", { name: "Alcance" });
    expect(scope).toHaveAttribute("id", "alcance");
    expect(within(scope).getAllByRole("listitem").map((li) => li.textContent)).toEqual(content.limits);
  });

  it("con sesión: solo cambian los enlaces de los datos; no inventa usuario ni sesión", () => {
    const content = scenarioContent("signed-in");
    const { container } = render(<LandingPage content={content} />);
    expect(screen.getByRole("link", { name: "Ir a mis documentos" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/cerrar sesión|hola|bienvenid|@/i);
  });

  it("todos los enlaces salen de los datos", () => {
    const content = scenarioContent("public");
    const { container } = render(<LandingPage content={content} />);
    const allowed = new Set([...content.navigation, content.primaryAction].map((l) => l.href));
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(allowed.has(href ?? "")).toBe(true);
  });

  it("muestra el copy como texto, nunca como HTML", () => {
    const content: LandingContent = {
      ...scenarioContent("public"),
      heading: "<img src=x onerror=alert(1)>Título",
      features: [{ title: "<b>negrita</b>", description: "<script>alert(1)</script>" }],
      limits: [],
    };
    const { container } = render(<LandingPage content={content} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("<img src=x onerror=alert(1)>Título");
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Alcance" })).queryByRole("list")).not.toBeInTheDocument();
  });
});
