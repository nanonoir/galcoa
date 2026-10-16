import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const redirect = vi.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { path });
});

// `server-only` no existe en este proyecto de test: se sustituyen los módulos de servidor.
vi.mock("@/lib/supabase/auth", () => ({ getCurrentSession: () => getCurrentSession() }));
vi.mock("@/lib/supabase/auth-flows", () => ({ MESSAGES: { unavailable: "El servicio de acceso no está disponible por ahora." } }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import NuevaContrasenaPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("/nueva-contrasena", () => {
  it("con sesión verificada muestra el formulario", async () => {
    getCurrentSession.mockResolvedValue({ status: "authenticated", user: { id: "u", email: null } });
    render(await NuevaContrasenaPage());
    expect(screen.getByRole("button", { name: "Guardar contraseña" })).toBeInTheDocument();
  });

  it("sin sesión pide otro enlace", async () => {
    getCurrentSession.mockResolvedValue({ status: "anonymous" });
    await expect(NuevaContrasenaPage()).rejects.toMatchObject({ path: "/recuperar?aviso=enlace-invalido" });
  });

  it.each([
    ["Auth no disponible", async () => ({ status: "unavailable" })],
    ["configuración ausente o excepción", async () => { throw new Error("SUPABASE_CONFIG_MISSING"); }],
  ])("%s: aviso técnico neutral, sin formulario, sin falso «sin sesión» ni error opaco", async (_, impl) => {
    getCurrentSession.mockImplementation(impl);
    render(await NuevaContrasenaPage());
    expect(screen.getByTestId("auth-unavailable")).toHaveTextContent("no está disponible");
    expect(screen.queryByRole("button", { name: "Guardar contraseña" })).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});
