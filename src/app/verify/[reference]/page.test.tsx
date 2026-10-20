import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createPublicVerification = vi.fn();

// Servicios de servidor sustituidos: sin base de datos, red ni `server-only`.
vi.mock("@/lib/documents/verification/runtime", () => ({ createPublicVerification: () => createPublicVerification() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/features/documents/containers/verifier-container", () => ({ VerifierContainer: () => <div data-testid="verifier" /> }));

import VerifyPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("/verify/[reference]", () => {
  it("rama de error: h1, alerta estructurada y recuperación, sin exponer el error", async () => {
    createPublicVerification.mockImplementation(() => {
      throw new Error("SECRET_DB_FAILURE");
    });
    render(await VerifyPage({ params: Promise.resolve({ reference: "ref/1 a" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Verificación pública" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No pudimos completar la verificación");
    expect(alert).toHaveTextContent("No pudimos consultar el registro");
    expect(document.body).not.toHaveTextContent("SECRET_DB_FAILURE");
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/verify/ref%2F1%20a");
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("verifier")).toBeNull();
  });
});
