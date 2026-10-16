import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internalPath } from "./use-auth-form";
import { LoginContainer, LogoutButton, NewPasswordContainer, RecoveryRequestContainer, RegisterContainer } from "./auth-containers";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Containers de acceso (MVP-031)", () => {
  it("login correcto: envía JSON al endpoint, muestra el éxito y navega a un destino interno", async () => {
    const fetchMock = vi.fn(async () => json({ state: { status: "success", message: "Ingreso correcto." }, redirectTo: "/" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "clave-larga-123");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Ingreso correcto.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@ejemplo.invalid", password: "clave-larga-123" });
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("error de credenciales: muestra el mensaje y permite reintentar sin navegar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: { status: "error", message: "Correo o contraseña incorrectos.", fieldErrors: [] } }, 401)));
    render(<LoginContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("registro: muestra los errores por campo que devuelve el servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ state: { status: "error", message: null, fieldErrors: [{ field: "confirmPassword", message: "Las contraseñas no coinciden." }] } }, 422)),
    );
    render(<RegisterContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "clave-larga-123");
    await userEvent.type(screen.getByLabelText(/Confirmar/), "otra");
    await userEvent.click(screen.getByRole("button", { name: /Crear|Registr/ }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
  });

  it("recuperación: éxito neutral sin navegación", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: { status: "success", message: "Si el correo corresponde a una cuenta, te enviamos un mensaje." } })));
    render(<RecoveryRequestContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.click(screen.getByRole("button", { name: "Solicitar recuperación" }));
    expect(await screen.findByText(/Si el correo corresponde/)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("nueva contraseña: envía ambos campos al endpoint de contraseña", async () => {
    const fetchMock = vi.fn(async () => json({ state: { status: "success", message: "Listo." }, redirectTo: "/acceso?aviso=contrasena-actualizada" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<NewPasswordContainer />);
    await userEvent.type(container.querySelector<HTMLInputElement>("#new-password-form-password")!, "otra-clave-456");
    await userEvent.type(screen.getByLabelText("Confirmar nueva contraseña"), "otra-clave-456");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/acceso?aviso=contrasena-actualizada"));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/auth/password");
  });

  it("fallo de red: error recuperable, nunca éxito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    render(<LoginContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "clave-larga-123");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("respuesta con forma inesperada: error recuperable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ inesperado: true })));
    render(<LoginContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument();
  });

  it("ignora un redirectTo externo aunque el servidor lo enviara", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ state: { status: "success", message: "Ok." }, redirectTo: "https://atacante.invalid" })));
    render(<LoginContainer />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@ejemplo.invalid");
    await userEvent.type(screen.getByLabelText("Contraseña"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByText("Ok.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("cierre de sesión: POST a logout y vuelve al acceso", async () => {
    const fetchMock = vi.fn(async () => json({ state: { status: "success", message: "Sesión cerrada." } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/acceso"));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/auth/logout");
  });
});

describe("internalPath", () => {
  it.each([
    ["/", "/"],
    ["/acceso?aviso=confirmado", "/acceso?aviso=confirmado"],
    ["//atacante.invalid", null],
    ["/\\atacante.invalid", null],
    ["https://atacante.invalid", null],
    ["javascript:alert(1)", null],
    [undefined, null],
  ])("%s", (value, expected) => {
    expect(internalPath(value)).toBe(expected);
  });
});
