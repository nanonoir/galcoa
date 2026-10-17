import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { AuthFormStateSchema } from "@/lib/contracts/auth-forms";
import {
  handleCallback,
  handleLogin,
  handleLogout,
  handleNewPassword,
  handleRecoveryRequest,
  handleRegister,
  readTrustedOrigins,
  TrustedOriginConfigError,
  trustedOrigin,
} from "@/lib/supabase/auth-http";
import { callbackFlow, classifyProviderError, MESSAGES } from "@/lib/supabase/auth-flows";

// Dobles del cliente de Auth; ningún proyecto real, correos ficticios (.invalid).
const ORIGIN = "http://127.0.0.1:3000";
const EMAIL = "ana@ejemplo.invalid";
const PASSWORD = "clave-larga-123";
const USER = { id: "11111111-1111-4111-8111-111111111111", email: EMAIL };

type Auth = Record<string, ReturnType<typeof vi.fn>>;
function fakeClient(overrides: Auth = {}) {
  const auth: Auth = {
    signUp: vi.fn(async () => ({ data: { user: USER, session: { user: USER, access_token: "ficticio" } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: USER }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: USER }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: USER }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
    ...overrides,
  };
  return { auth, deps: { getClient: async () => ({ auth }) as never, trustedOrigins: [ORIGIN] } };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const read = async (response: Response) => (await response.json()) as { state: { status: string; message?: string; fieldErrors?: { field: string; message: string }[] }; redirectTo?: string };

const apiError = (status: number, code: string) => new AuthApiError("texto interno del proveedor", status, code);

describe("Protección de origen y formato (CSRF)", () => {
  it.each([
    ["sin Origin", {}],
    ["otro origen", { origin: "https://atacante.invalid" }],
    ["Origin ilegible", { origin: "no-es-una-url" }],
  ])("rechaza %s sin tocar Auth", async (_, headers) => {
    const { auth, deps } = fakeClient();
    const request = new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const response = await handleLogin(request, deps);
    expect(response.status).toBe(403);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const { auth, deps } = fakeClient();
    const request = post("/api/auth/login", { email: EMAIL, password: PASSWORD }, { "content-type": "text/plain" });
    expect((await handleLogin(request, deps)).status).toBe(415);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("JSON ilegible: 400 con mensaje genérico", async () => {
    const { deps } = fakeClient();
    const request = new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: "{no es json",
    });
    expect((await handleLogin(request, deps)).status).toBe(400);
  });

  const VERCEL = "https://galcoa-nea.vercel.app";

  it("trustedOrigin: coincidencia exacta de esquema y host con la lista canónica", () => {
    const trusted = [ORIGIN, VERCEL];
    expect(trustedOrigin(post("/x", {}), trusted)).toBe(ORIGIN);
    expect(trustedOrigin(post("/x", {}, { origin: VERCEL }), trusted)).toBe(VERCEL);
    for (const origin of ["ftp://127.0.0.1:3000", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "http://galcoa-nea.vercel.app", `${VERCEL}.atacante.invalid`, "null"]) {
      expect(trustedOrigin(post("/x", {}, { origin }), trusted), origin).toBeNull();
    }
  });

  it("HTTP no sirve donde solo se confía en HTTPS (y viceversa)", async () => {
    const { auth, deps } = fakeClient();
    const strict = { ...deps, trustedOrigins: [VERCEL] };
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }, { origin: "http://galcoa-nea.vercel.app" }), strict);
    expect(response.status).toBe(403);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("Host o X-Forwarded-Host falsificados no legitiman un Origin ajeno, ni sin Origin", async () => {
    const { auth, deps } = fakeClient();
    const body = { email: EMAIL, password: PASSWORD };
    const spoofed = await handleLogin(
      post("/api/auth/login", body, { origin: "https://atacante.invalid", host: "atacante.invalid", "x-forwarded-host": "atacante.invalid", "x-forwarded-proto": "https" }),
      deps,
    );
    expect(spoofed.status).toBe(403);
    const noBrowser = new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000" },
      body: JSON.stringify(body),
    });
    expect((await handleLogin(noBrowser, deps)).status).toBe(403);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("el enlace de correo usa el origen confiable, nunca cabeceras de la petición", async () => {
    const { auth, deps } = fakeClient();
    const request = post("/api/auth/recovery", { email: EMAIL }, { "x-forwarded-host": "atacante.invalid", "x-forwarded-proto": "https", host: "atacante.invalid" });
    expect((await handleRecoveryRequest(request, { ...deps, trustedOrigins: [ORIGIN, VERCEL] })).status).toBe(200);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, { redirectTo: `${ORIGIN}/api/auth/callback?flow=recovery` });
  });

  it("sin origen canónico configurado: 503 neutral y sin llamar a Auth (no «origen hostil»)", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), { getClient: deps.getClient, readEnv: () => undefined });
    expect(response.status).toBe(503);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("readTrustedOrigins: lista por comas, normaliza y descarta lo inválido; vacío lanza", () => {
    expect(readTrustedOrigins(() => `${ORIGIN}/ruta, ${VERCEL} ,no-url,javascript:alert(1)`)).toEqual([ORIGIN, VERCEL]);
    expect(() => readTrustedOrigins(() => undefined)).toThrow(TrustedOriginConfigError);
    expect(() => readTrustedOrigins(() => "no-url,ftp://x.invalid")).toThrow(TrustedOriginConfigError);
  });

  it("las respuestas son privadas: sin caché ni Referer", async () => {
    const { deps } = fakeClient();
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("Validación en el servidor", () => {
  it("registro: contraseña corta, distinta y correo inválido dan errores por campo", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleRegister(post("/api/auth/register", { email: "no-es-correo", password: "corta", confirmPassword: "otra" }), deps);
    expect(response.status).toBe(422);
    const { state } = await read(response);
    expect(state.fieldErrors?.map((e) => e.field).sort()).toEqual(["confirmPassword", "email", "password"]);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("registro: confirmación distinta", async () => {
    const { deps } = fakeClient();
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: "otra-clave-123" }), deps);
    expect((await read(response)).state.fieldErrors).toEqual([{ field: "confirmPassword", message: "Las contraseñas no coinciden." }]);
  });

  it("campos de más o tipos erróneos: 422 sin llamar a Auth", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleLogin(post("/api/auth/login", { email: 1, password: PASSWORD }), deps);
    expect(response.status).toBe(422);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("toda respuesta cumple el contrato de estado de la presentación", async () => {
    const { deps } = fakeClient();
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps);
    expect(AuthFormStateSchema.safeParse((await read(response)).state).success).toBe(true);
  });
});

describe("Alta", () => {
  it("normaliza el correo y redirige al dashboard con la sesión del registro", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleRegister(post("/api/auth/register", { email: ` ${EMAIL.toUpperCase()} `, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(200);
    expect(auth.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(await read(response)).toEqual({ state: { status: "success", message: MESSAGES.registerOk }, redirectTo: "/dashboard" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("alta sin sesión: no anuncia éxito ni redirige si Auth todavía exige confirmación", async () => {
    const { deps } = fakeClient({ signUp: vi.fn(async () => ({ data: { user: USER, session: null }, error: null })) });
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(503);
    expect(await read(response)).toEqual({ state: { status: "error", message: MESSAGES.unavailable, fieldErrors: [] } });
  });

  it("alta repetida: error neutral sin redirección ni intento de acceso", async () => {
    const taken = fakeClient({ signUp: vi.fn(async () => ({ data: { user: null }, error: apiError(422, "user_already_exists") })) });
    const body = { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD };
    const b = await handleRegister(post("/api/auth/register", body), taken.deps);
    expect(b.status).toBe(422);
    expect(await read(b)).toEqual({ state: { status: "error", message: MESSAGES.registrationRejected, fieldErrors: [] } });
    expect(taken.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("contraseña débil según el proveedor: error en el campo contraseña", async () => {
    const weak = new AuthWeakPasswordError("débil", 422, ["length"]);
    const { deps } = fakeClient({ signUp: vi.fn(async () => ({ data: { user: null }, error: weak })) });
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(422);
    expect((await read(response)).state.fieldErrors?.[0]?.field).toBe("password");
  });

  it("límite de correos: 429 explícito, no éxito", async () => {
    const { deps } = fakeClient({ signUp: vi.fn(async () => ({ data: { user: null }, error: apiError(429, "over_email_send_rate_limit") })) });
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(429);
    expect((await read(response)).state.status).toBe("error");
  });

  it.each([
    ["proveedor caído", new AuthRetryableFetchError("fetch failed", 0)],
    ["5xx", apiError(500, "unexpected_failure")],
  ])("%s: 503, nunca éxito ficticio", async (_, error) => {
    const { deps } = fakeClient({ signUp: vi.fn(async () => ({ data: { user: null }, error })) });
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(503);
    expect((await read(response)).state).toMatchObject({ status: "error", message: MESSAGES.unavailable });
  });

  it("excepción inesperada: 503", async () => {
    const { deps } = fakeClient({ signUp: vi.fn(async () => { throw new Error("boom"); }) });
    const response = await handleRegister(post("/api/auth/register", { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD }), deps);
    expect(response.status).toBe(503);
  });
});

describe("Acceso y cierre de sesión", () => {
  it("acceso correcto redirige a un destino interno", async () => {
    const { deps } = fakeClient();
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps);
    expect(response.status).toBe(200);
    expect((await read(response)).redirectTo).toBe("/dashboard");
  });

  it.each([
    ["contraseña errónea", "invalid_credentials"],
    ["correo sin confirmar", "email_not_confirmed"],
    ["cuenta inexistente", "user_not_found"],
  ])("%s: un único mensaje y estado", async (_, code) => {
    const { deps } = fakeClient({ signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: apiError(400, code) })) });
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps);
    expect(response.status).toBe(401);
    expect((await read(response)).state).toEqual({ status: "error", message: MESSAGES.credentials, fieldErrors: [] });
  });

  it("proveedor caído en el acceso: 503, no «credenciales incorrectas»", async () => {
    const { deps } = fakeClient({ signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: new AuthRetryableFetchError("x", 0) })) });
    expect((await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps)).status).toBe(503);
  });

  it("logout cierra la sesión local y manda al acceso", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleLogout(post("/api/auth/logout", undefined), deps);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect((await read(response)).redirectTo).toBe("/acceso");
  });

  it("logout sin sesión previa sigue siendo correcto", async () => {
    const { deps } = fakeClient({ signOut: vi.fn(async () => ({ error: new AuthSessionMissingError() })) });
    expect((await handleLogout(post("/api/auth/logout", undefined), deps)).status).toBe(200);
  });

  it("logout con el proveedor caído informa el impedimento", async () => {
    const { deps } = fakeClient({ signOut: vi.fn(async () => ({ error: new AuthRetryableFetchError("x", 0) })) });
    expect((await handleLogout(post("/api/auth/logout", undefined), deps)).status).toBe(503);
  });
});

describe("Recuperación", () => {
  it("cuenta existente e inexistente reciben la misma respuesta", async () => {
    const known = fakeClient();
    const unknown = fakeClient({ resetPasswordForEmail: vi.fn(async () => ({ data: null, error: apiError(400, "user_not_found") })) });
    const a = await handleRecoveryRequest(post("/api/auth/recovery", { email: EMAIL }), known.deps);
    const b = await handleRecoveryRequest(post("/api/auth/recovery", { email: "otra@ejemplo.invalid" }), unknown.deps);
    expect(b.status).toBe(a.status);
    expect(await read(b)).toEqual(await read(a));
    expect(known.auth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL, { redirectTo: `${ORIGIN}/api/auth/callback?flow=recovery` });
  });

  it("límite de envíos: 429; proveedor caído: 503", async () => {
    const limited = fakeClient({ resetPasswordForEmail: vi.fn(async () => ({ data: null, error: apiError(429, "over_email_send_rate_limit") })) });
    const down = fakeClient({ resetPasswordForEmail: vi.fn(async () => ({ data: null, error: new AuthRetryableFetchError("x", 0) })) });
    expect((await handleRecoveryRequest(post("/api/auth/recovery", { email: EMAIL }), limited.deps)).status).toBe(429);
    expect((await handleRecoveryRequest(post("/api/auth/recovery", { email: EMAIL }), down.deps)).status).toBe(503);
  });
});

describe("Nueva contraseña", () => {
  const body = { password: "otra-clave-456", confirmPassword: "otra-clave-456" };

  it("con sesión de recuperación: actualiza, cierra esa sesión y manda al acceso", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleNewPassword(post("/api/auth/password", body), deps);
    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: body.password });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect((await read(response)).redirectTo).toBe("/acceso?aviso=contrasena-actualizada");
  });

  it("sin sesión: 401 y no intenta actualizar", async () => {
    const { auth, deps } = fakeClient({ getUser: vi.fn(async () => ({ data: { user: null }, error: new AuthSessionMissingError() })) });
    const response = await handleNewPassword(post("/api/auth/password", body), deps);
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("misma contraseña anterior: error en el campo", async () => {
    const { deps } = fakeClient({ updateUser: vi.fn(async () => ({ data: { user: null }, error: apiError(422, "same_password") })) });
    const response = await handleNewPassword(post("/api/auth/password", body), deps);
    expect((await read(response)).state.fieldErrors?.[0]).toMatchObject({ field: "password", message: MESSAGES.samePassword });
  });

  it("verificación de sesión caída: 503", async () => {
    const { deps } = fakeClient({ getUser: vi.fn(async () => ({ data: { user: null }, error: new AuthRetryableFetchError("x", 0) })) });
    expect((await handleNewPassword(post("/api/auth/password", body), deps)).status).toBe(503);
  });
});

describe("Callback de confirmación y recuperación", () => {
  const get = (query: string) => new Request(`${ORIGIN}/api/auth/callback?${query}`);
  const location = (response: Response) => response.headers.get("location")!;

  it("recuperación: canjea el código, conserva la sesión y va a la nueva contraseña", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleCallback(get("flow=recovery&code=abc"), deps);
    expect(response.status).toBe(303);
    expect(location(response)).toBe("/nueva-contrasena");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("alta: canjea el código, cierra la sesión y va al acceso con aviso", async () => {
    const { auth, deps } = fakeClient();
    const response = await handleCallback(get("flow=signup&code=abc"), deps);
    expect(location(response)).toBe("/acceso?aviso=confirmado");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    ["destino externo", "flow=https://atacante.invalid&code=abc"],
    ["clave heredada", "flow=constructor&code=abc"],
    ["sin flujo", "code=abc"],
    ["sin código", "flow=recovery"],
    ["parámetro next ignorado", "flow=bogus&next=https://atacante.invalid&code=abc"],
  ])("%s: enlace inválido, sin canjear ni redirigir fuera", async (_, query) => {
    const { auth, deps } = fakeClient();
    const response = await handleCallback(get(query), deps);
    expect(location(response)).toBe("/acceso?aviso=enlace-invalido");
    // Siempre una ruta interna relativa, nunca un host ni «//».
    expect(location(response)).toMatch(/^\/(?![/\\])/);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("código vencido o usado: enlace inválido, sin sesión", async () => {
    const { deps } = fakeClient({ exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: apiError(400, "flow_state_expired") })) });
    expect(location(await handleCallback(get("flow=recovery&code=viejo"), deps))).toBe("/acceso?aviso=enlace-invalido");
  });

  it("no filtra el código en la redirección ni en cabeceras, y no usa Referer", async () => {
    const { deps } = fakeClient();
    const response = await handleCallback(get("flow=recovery&code=secreto-123"), deps);
    expect([...response.headers.values()].join(" ")).not.toContain("secreto-123");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("sin cliente (configuración ausente): enlace inválido en vez de error 500", async () => {
    const response = await handleCallback(get("flow=recovery&code=abc"), { getClient: async () => { throw new Error("config"); } });
    expect(location(response)).toBe("/acceso?aviso=enlace-invalido");
  });

  it("callbackFlow ante excepción del proveedor: enlace inválido", async () => {
    const client = { auth: { exchangeCodeForSession: async () => { throw new Error("boom"); } } } as never;
    expect(await callbackFlow(client, "recovery", "abc")).toBe("/acceso?aviso=enlace-invalido");
  });
});

describe("Sin secretos en logs ni en las respuestas", () => {
  it("ningún flujo escribe en consola ni devuelve la contraseña o el texto del proveedor", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { deps } = fakeClient({ signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: apiError(400, "invalid_credentials") })) });
    const response = await handleLogin(post("/api/auth/login", { email: EMAIL, password: PASSWORD }), deps);
    const text = JSON.stringify(await read(response));
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("proveedor");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("Clasificación de errores del proveedor", () => {
  it.each([
    [new AuthRetryableFetchError("x", 0), "unavailable"],
    [apiError(500, "unexpected_failure"), "unavailable"],
    [apiError(429, "over_request_rate_limit"), "rate_limited"],
    [apiError(422, "weak_password"), "weak_password"],
    [apiError(422, "signup_disabled"), "closed"],
    [apiError(400, "invalid_credentials"), "rejected"],
    [new Error("desconocido"), "unavailable"],
  ])("%#", (error, expected) => {
    expect(classifyProviderError(error)).toBe(expected);
  });
});
