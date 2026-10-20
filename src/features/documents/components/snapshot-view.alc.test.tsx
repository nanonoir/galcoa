import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import { snapshotScenarios } from "@/mocks/documents";

import { SnapshotView } from "./snapshot-view";

const base = snapshotScenarios.find((s) => s.state.status === "ready")!.state;
if (base.status !== "ready") throw new Error("escenario ready inexistente");
const baseOperation = base.content.operation;

type Color = "verde" | "amarillo" | "rojo";
const status = { verde: "confirmado", amarillo: "declarado", rojo: "contradicho" } as const;
const rule = { verde: "ALC-FUENTES-COINCIDENTES", amarillo: "ALC-DATO-DECLARADO", rojo: "ALC-CONTRADICCION" } as const;

function stateOf(color: Color) {
  return {
    ...base,
    content: {
      operation: baseOperation,
      warnings: [],
      selection: ["autor", "intermediario", "comprador"] as ["autor", "intermediario", "comprador"],
      alc: {
        rulesVersion: "galcoa.alc.v1",
        color,
        inputHash: "a".repeat(64),
        findings: [{ ruleId: rule[color], claimId: "c_1", sources: [] }],
        claims: [{ id: "c_1", subject: "cajas", field: "cantidad", value: "12", unit: null, status: status[color] }],
      },
      rectifications: [],
    },
  };
}

describe("SnapshotView v2 - semaforo ALC", () => {
  it("el interruptor de la demo esta encendido: oculta las advertencias heredadas, no el semaforo", () => {
    expect(DEMO_HIDE_WARNINGS).toBe(true);
  });

  it.each<[Color, RegExp]>([
    ["verde", /Coincide con un original conservado/],
    ["amarillo", /Declarado/],
    ["rojo", /Contradicho por una fuente/],
  ])("%s: se muestra aunque las advertencias esten ocultas, con rotulos de proveedor/transportista", (color, claimLabel) => {
    const { container } = render(<SnapshotView state={stateOf(color)} onRetry={vi.fn()} />);
    expect(screen.getByText(new RegExp(`Sem.foro ${color}`, "i"))).toBeInTheDocument();
    expect(screen.getByText(claimLabel)).toBeInTheDocument();
    expect(container.textContent).toMatch(/Proveedor, Transportista, Comprador/);
    expect(screen.queryByRole("region", { name: "Advertencias" })).not.toBeInTheDocument();
  });

  it("rojo avisa que no se puede sellar; amarillo no presenta lo declarado como confirmado", () => {
    const { unmount } = render(<SnapshotView state={stateOf("rojo")} onRetry={vi.fn()} />);
    expect(screen.getByText(/no se puede sellar/i)).toBeInTheDocument();
    unmount();
    render(<SnapshotView state={stateOf("amarillo")} onRetry={vi.fn()} />);
    expect(screen.queryByText(/Coincide con un original conservado/)).not.toBeInTheDocument();
  });
});