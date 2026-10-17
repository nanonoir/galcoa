import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { landingScenarios } from "@/mocks/marketing";

import { SiteNavigation, siteNavigationProps } from "./site-navigation";

describe("SiteNavigation (MVP-114)", () => {
  it("muestra solo la marca, sin atajos de navegación, en todos los escenarios", () => {
    for (const scenario of landingScenarios) {
      const { container, unmount } = render(<SiteNavigation {...siteNavigationProps(scenario.content)} />);
      expect(screen.getByText(scenario.content.brand)).toBeInTheDocument();
      expect(container.querySelectorAll("a")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Menú" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("muestra a la derecha la acción que recibe ya resuelta", () => {
    render(<SiteNavigation brand="Marca de prueba" action={<button type="button">Cerrar sesión</button>} />);
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
