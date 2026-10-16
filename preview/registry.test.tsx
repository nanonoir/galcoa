import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PreviewApp } from "./preview-app";
import { previewEntries, type LocalHandlers } from "./registry";

const handlers: LocalHandlers = { onCreate: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn(), log: vi.fn() };

describe("registro del preview", () => {
  it("ids de entradas y de escenarios únicos", () => {
    const ids = previewEntries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of previewEntries) {
      const sc = entry.scenarios.map((s) => s.id);
      expect(new Set(sc).size, entry.id).toBe(sc.length);
    }
  });

  it("todo escenario de toda entrada renderiza sin error", () => {
    for (const entry of previewEntries) {
      for (const scenario of entry.scenarios) {
        const { unmount } = render(<div>{entry.render(scenario.id, handlers)}</div>);
        unmount();
      }
    }
  });

  it("las entradas placeholder lo declaran y vuelcan el contrato como JSON", () => {
    for (const entry of previewEntries.filter((e) => e.id.endsWith("-placeholder"))) {
      const { unmount } = render(<div>{entry.render(entry.scenarios[0].id, handlers)}</div>);
      expect(screen.getByRole("status")).toHaveTextContent("Placeholder de escenario");
      expect(JSON.parse(screen.getByTestId("scenario-json").textContent ?? "")).toBeTypeOf("object");
      unmount();
    }
  });
});

describe("PreviewApp con varias entradas", () => {
  it("ofrece selector de componente y cambia de escenarios al elegir una entrada", async () => {
    const user = userEvent.setup();
    render(<PreviewApp />);
    const components = screen.getByRole("group", { name: "Componente" });
    await user.click(within(components).getByRole("button", { name: /Historial/ }));
    const scenarios = screen.getByRole("group", { name: "Escenario" });
    expect(within(scenarios).getByRole("button", { name: "Cargando" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(scenarios).getByRole("button", { name: "v1 registrada y v2 con sello pendiente" }));
    await user.click(screen.getByRole("button", { name: 'onSelect("ver-soja-001-2")' }));
    expect(within(screen.getByRole("complementary")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(['onSelect("ver-soja-001-2")']);
  });
});
