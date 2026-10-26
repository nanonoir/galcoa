import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FinalizationPanel } from "./finalization-panel";

describe("FinalizationPanel · vocabulario (F-5)", () => {
  it("idle: el botón dice «Finalizar y registrar huella» y lo dispara una sola acción", async () => {
    const onFinalize = vi.fn();
    render(<FinalizationPanel state={{ status: "idle" }} onFinalize={onFinalize} onRefresh={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Finalizar y registrar huella" }));
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/se registra en Hedera Testnet una huella que permite comprobar que el PDF no cambió/)).toBeInTheDocument();
  });

  it("fallido o detenido: ofrece «Reintentar», nunca «Reintentar subida»", () => {
    const { rerender } = render(<FinalizationPanel state={{ status: "failed", code: "x" }} onFinalize={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    rerender(<FinalizationPanel state={{ status: "stalled", phase: null }} onFinalize={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText(/subida|subir/i)).not.toBeInTheDocument();
  });

  it("no habla de «contrato» en ningún estado visible", () => {
    const { container, rerender } = render(<FinalizationPanel state={{ status: "idle" }} onFinalize={vi.fn()} onRefresh={vi.fn()} />);
    expect(container.textContent).not.toMatch(/contrato/i);
    rerender(<FinalizationPanel state={{ status: "stalled", phase: null }} onFinalize={vi.fn()} onRefresh={vi.fn()} />);
    expect(container.textContent).not.toMatch(/contrato/i);
  });
});
