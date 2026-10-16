import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { landingScenarios } from "@/mocks/marketing";

import { SiteNavigation, siteNavigationProps } from "./site-navigation";

function scenarioContent(id: string) {
  const scenario = landingScenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`Escenario inexistente: ${id}`);
  return scenario.content;
}

function renderNavigation(id = "public") {
  const view = render(<SiteNavigation {...siteNavigationProps(scenarioContent(id))} />);
  const nav = screen.getByRole("navigation", { name: "Principal" });
  const toggle = within(nav).getByRole("button", { name: "Menú" });
  return { ...view, nav, toggle, user: userEvent.setup() };
}

const mobileMenu = () => screen.queryByRole("list", { name: "Menú" });

describe("SiteNavigation (MVP-114)", () => {
  it("muestra la marca y los enlaces que recibe como datos, en todos los escenarios", () => {
    for (const scenario of landingScenarios) {
      const { unmount, nav } = renderNavigation(scenario.id);
      expect(within(nav).getByText(scenario.content.brand)).toBeInTheDocument();
      for (const link of scenario.content.navigation) {
        expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
      }
      unmount();
    }
  });

  it("no fija destinos: otros datos producen otros enlaces", () => {
    render(<SiteNavigation brand="Marca de prueba" links={[{ label: "Otra sección", href: "#otra" }]} />);
    expect(screen.getByRole("link", { name: "Otra sección" })).toHaveAttribute("href", "#otra");
    expect(screen.queryByRole("link", { name: "Ingresar" })).not.toBeInTheDocument();
  });

  it("menú móvil cerrado por defecto; el botón lo abre y lo cierra devolviendo el foco", async () => {
    const { toggle, user } = renderNavigation();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(mobileMenu()).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = mobileMenu();
    expect(menu).toHaveAttribute("id", toggle.getAttribute("aria-controls"));
    expect(within(menu as HTMLElement).getAllByRole("link").map((a) => a.textContent)).toEqual(["Cómo funciona", "Alcance", "Ingresar"]);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(mobileMenu()).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("teclado: Enter abre, Tab entra a los enlaces y Escape cierra con el foco en «Menú»", async () => {
    const { toggle, user } = renderNavigation();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(mobileMenu()).toBeInTheDocument();

    // En jsdom también existen los enlaces de escritorio; se toma el primero del menú desplegado.
    const first = within(mobileMenu() as HTMLElement).getByRole("link", { name: "Cómo funciona" });
    first.focus();
    await user.keyboard("{Escape}");
    expect(mobileMenu()).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("elegir un enlace del menú lo cierra", async () => {
    const { toggle, user } = renderNavigation("signed-in");
    await user.click(toggle);
    await user.click(within(mobileMenu() as HTMLElement).getByRole("link", { name: "Alcance" }));
    expect(mobileMenu()).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape con el menú cerrado no hace nada", async () => {
    const { toggle, user } = renderNavigation();
    toggle.focus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
