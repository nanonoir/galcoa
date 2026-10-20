import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { LandingContent } from "@/lib/contracts/landing";
import { landingScenarios } from "@/mocks/marketing";

import { LandingPage } from "./landing-page";

/** Términos que la UI nunca usa para lo que produce el sistema (PRD §5, §11). */
const FORBIDDEN = ["certificado", "validado regulatoriamente", "garantizado verdadero", "firma digital", "identidad verificada"];
/** Promesas fuera de P0 (PRD §1, §4). */
const OUT_OF_SCOPE = [/mainnet/i, /(?<!ni )\bpagos?\b/i, /mercado pago/i, /stripe/i, /env[ií]o autom[aá]tico/i, /(?<!no )garantiza que .* verdader/i];

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

  it("estructura: hero con acción principal y «Cómo funciona» debajo de ella; sin sección «Alcance»", () => {
    const content = scenarioContent("public");
    render(<LandingPage content={content} />);
    expect(screen.getByRole("heading", { level: 1, name: content.heading })).toBeInTheDocument();
    expect(screen.getByText(content.summary)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");

    const features = screen.getByRole("region", { name: "Cómo funciona" });
    expect(features).toHaveAttribute("id", "como-funciona");
    expect(within(features).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(content.features.map((f) => f.title));

    const cta = screen.getByRole("link", { name: "Crear cuenta" });
    expect(cta.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cómo funciona" }).closest("[aria-labelledby=landing-title]")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Alcance" })).not.toBeInTheDocument();
    expect(document.getElementById("alcance")).toBeNull();
  });

  it("título, descripción y acción del hero aprobados", () => {
    render(<LandingPage content={scenarioContent("public")} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cada entrega cuenta. Hacé que también te respalde.");
    expect(screen.getByText(/construir la reputación de tu distribuidora/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
  });

  it("sección «Próximamente · Contratos inteligentes» al final, sin acción ni función disponible", () => {
    const { container } = render(<LandingPage content={scenarioContent("public")} />);
    const section = screen.getByRole("region", { name: "Cada meta cumplida, un beneficio acordado." });
    expect(within(section).getByText("Próximamente · Contratos inteligentes")).toBeInTheDocument();
    expect(within(section).getByText("100.000 unidades vendidas → USD 10.000 de bonificación acordada.")).toBeInTheDocument();
    expect(within(section).getByText(/No implica ganancias garantizadas ni pagos automáticos\. Primera etapa sin custodia ni transferencia de fondos\./)).toBeInTheDocument();
    expect(within(section).queryByRole("link")).not.toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    const hero = container.querySelector("[aria-labelledby=landing-title]");
    expect(hero?.compareDocumentPosition(section)).toBeTruthy();
    expect((hero?.compareDocumentPosition(section) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero?.contains(section)).toBe(false);
  });

  it("recorrido explicativo: tres pasos, sin cifras ni imágenes", () => {
    const { container } = render(<LandingPage content={scenarioContent("public")} />);
    const journey = screen.getByRole("list", { name: "Recorrido de un registro" });
    const titles = within(journey).getAllByRole("listitem").map((li) => li.querySelector("[data-step-title]")?.textContent);
    expect(titles).toEqual(["Registrá la entrega", "Revisá y obtené la confirmación", "Respaldá tu trabajo"]);
    expect(within(journey).getByText(/Hedera Testnet/)).toBeInTheDocument();
    // Sin imágenes ni lienzos: el hero se compone con texto y CSS (el test original solo buscaba evitar capturas falsas).
    expect(container.querySelector("img, svg, canvas")).toBeNull();
  });

  it("hero interactivo: etapa inicial, clic, teclado y hover de mouse (no de toque) cambian la etapa", async () => {
    const user = userEvent.setup();
    render(<LandingPage content={scenarioContent("public")} />);
    const steps = within(screen.getByRole("list", { name: "Recorrido de un registro" })).getAllByRole("button");
    expect(steps.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);

    await user.click(steps[1]);
    expect(steps[1]).toHaveAttribute("aria-pressed", "true");

    steps[2].focus();
    await user.keyboard("{Enter}");
    expect(steps[2]).toHaveAttribute("aria-pressed", "true");
    steps[1].focus();
    await user.keyboard(" ");
    expect(steps[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerEnter(steps[0], { pointerType: "touch" });
    expect(steps[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerEnter(steps[0], { pointerType: "mouse" });
    expect(steps[0]).toHaveAttribute("aria-pressed", "true");
    // La selección no roba el foco ni quita contenido: las tres descripciones siguen en el DOM.
    expect(steps[1]).toHaveFocus();
    expect(screen.getAllByText(/Hedera Testnet/).length).toBeGreaterThan(0);
  });

  it("contenido visible sin revelado: los bloques revelables no nacen ocultos", () => {
    render(<LandingPage content={scenarioContent("public")} />);
    expect(screen.getByRole("region", { name: "Cómo funciona" })).not.toHaveAttribute("data-reveal");
    for (const li of within(screen.getByRole("region", { name: "Cómo funciona" })).getAllByRole("listitem")) {
      expect(li).toHaveClass("motion-enter");
    }
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
  });
});
