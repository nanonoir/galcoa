import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationScreen } from "./confirmation-screen";

// Interruptor de la demo encendido (valor real): la pantalla de terceros no muestra advertencias.
describe("ConfirmationScreen · advertencias ocultas (demo)", () => {
  it("no oculta el semáforo ni las rectificaciones del snapshot v2 al comprador", () => {
    render(<ConfirmationScreen state={{ status: "ready", invitation: {
      schemaVersion: 2, revisionId: "rev-v2", snapshotId: "snap-v2", snapshotHash: "b".repeat(64),
      role: "comprador", selection: ["autor", "comprador"], availability: "disponible",
      expiresAt: "2026-10-19T12:00:00.000Z", warnings: [],
      operation: { title: "Entrega ficticia", body: "Se entregan 12 cajas.", corrections: [] },
      alc: { rulesVersion: "galcoa.alc.v1", color: "rojo", inputHash: "c".repeat(64),
        findings: [{ ruleId: "ALC-CONTRADICCION", claimId: "quantity", sources: ["ALC-1"] }], claims: [] },
      rectifications: [{ claimId: "quantity", previousValue: "10", correctedValue: "12", reason: "Corrección explícita ficticia",
        originalSources: ["ALC-1"], correctedSources: ["ALC-2"] }],
    } }} onConfirm={vi.fn()} onReject={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Contraste de fuentes" })).toHaveTextContent("Semáforo Rojo");
    expect(screen.getByText(/Corrección explícita ficticia/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Advertencias" })).not.toBeInTheDocument();
  });
  it("no renderiza la sección ni el texto de las advertencias aunque la invitación las traiga", () => {
    const { container } = render(
      <ConfirmationScreen
        state={{
          status: "ready",
          invitation: {
            schemaVersion: 1,
            revisionId: "rev-1",
            snapshotId: "snap-1",
            snapshotHash: "a".repeat(64),
            role: "comprador",
            selection: ["autor", "comprador"],
            operation: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas de ejemplo.", corrections: [] },
            warnings: [{ id: "aviso-1", message: "Las fuentes no coinciden.", severity: "critical", sources: [] }],
            availability: "disponible",
            expiresAt: "2026-10-19T12:00:00.000Z",
          },
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Advertencias" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/advertencia|Las fuentes no coinciden/i);
    expect(screen.getByText("Se entregan 12 cajas de ejemplo.")).toBeInTheDocument();
  });
});
