import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./error-screen";

describe("ErrorScreen (F-8)", () => {
  it("no encontrado: explica, ofrece mis documentos e inicio, sin reintento ni código", () => {
    render(<ErrorScreen kind="not-found" reference="abc123" onRetry={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeInTheDocument();
    expect(screen.getByText(/no tengas acceso a este documento/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mis documentos" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.queryByText(/pasá este código/)).not.toBeInTheDocument();
  });

  it("error: «Reintentar» llama a onRetry, «Ir a mis documentos» queda secundario y se ve el código", async () => {
    const onRetry = vi.fn();
    render(<ErrorScreen kind="error" reference="1234567890" onRetry={onRetry} />);
    expect(screen.getByRole("heading", { level: 1, name: "Algo falló al cargar" })).toBeInTheDocument();
    expect(screen.getByText(/Tus datos no se perdieron/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Ir a mis documentos" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir al inicio" })).not.toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();
  });

  it("error grave: solo «Reintentar», sin enlaces", () => {
    render(<ErrorScreen kind="fatal" onRetry={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "GALCOA+ no pudo abrirse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("nunca muestra un mensaje o una traza como código de referencia", () => {
    const leaked = "TypeError: Cannot read properties of undefined (reading 'id')\n    at page.tsx:32";
    render(<ErrorScreen kind="error" reference={leaked} onRetry={vi.fn()} />);
    expect(screen.queryByText(/pasá este código/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("TypeError");
  });

  it("sin onRetry no ofrece reintentar y «Ir a mis documentos» pasa a ser la acción principal", () => {
    render(<ErrorScreen kind="error" documentsHref="/dashboard?desde=error" />);
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mis documentos" })).toHaveAttribute("href", "/dashboard?desde=error");
  });

  it("no usa vocabulario técnico ni palabras prohibidas", () => {
    for (const kind of ["not-found", "error", "fatal"] as const) {
      const { unmount } = render(<ErrorScreen kind={kind} onRetry={vi.fn()} />);
      expect(document.body.textContent ?? "").not.toMatch(/stack|digest|exception|HCS|hash|certificad|garantizad/i);
      unmount();
    }
  });
});
