import { expect, test, type Page } from "@playwright/test";

import { resolveAuthE2eEnv } from "./auth-env";

/**
 * Flujo real de Auth contra Supabase local (MVP-031): registro → buzón local →
 * confirmación → acceso → cierre de sesión → recuperación → enlace → nueva
 * contraseña → acceso. Sin servicios remotos ni correo real. Si falta la
 * instancia local, la suite se omite explícitamente (ver `auth.config.ts`).
 *
 * Pendiente (MVP-116): navegación a una ruta privada real. Aquí la guarda de
 * sesión se comprueba con `/nueva-contrasena`, que exige sesión verificada.
 */

// Lanza si AUTH_E2E=1 y falta algo; `null` solo si la suite no fue solicitada.
const e2e = resolveAuthE2eEnv(process.env);
const MAIL_URL = e2e?.mailUrl;
const configured = e2e !== null;

const stamp = Date.now().toString(36);
const EMAIL = `e2e-${stamp}@galcoa-e2e.test`;
const PASSWORD = `clave-${stamp}-uno`;
const NEW_PASSWORD = `clave-${stamp}-dos`;

type MailSummary = { ID: string; Subject: string; Created: string };

/** Espera el mensaje más reciente para `to` que aún no se vio y devuelve el enlace de Auth. */
async function nextLinkFor(to: string, seen: Set<string>): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (search.ok) {
      const { messages = [] } = (await search.json()) as { messages?: MailSummary[] };
      const fresh = messages.find((m) => !seen.has(m.ID));
      if (fresh) {
        seen.add(fresh.ID);
        const detail = (await (await fetch(`${MAIL_URL}/api/v1/message/${fresh.ID}`)).json()) as { Text?: string; HTML?: string };
        const body = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`;
        const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/)?.[0];
        if (link) return link.replaceAll("&amp;", "&");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("No llegó el correo esperado al buzón local.");
}

async function fill(page: Page, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) await page.getByRole("textbox", { name: label, exact: true }).fill(value);
}

const hasSessionCookie = async (page: Page) => (await page.context().cookies()).some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));

test.describe.configure({ mode: "serial" });

test.describe("Auth local real (MVP-031)", () => {
  test.skip(!configured, "Suite NO solicitada (AUTH_E2E!=1): ejecútala con `npm run test:e2e:auth`. No acredita nada.");

  const seen = new Set<string>();

  test("registro, confirmación, acceso, cierre de sesión, recuperación y nueva contraseña", async ({ page }) => {
    const consoleText: string[] = [];
    page.on("console", (message) => consoleText.push(message.text()));

    // Registro: respuesta neutral.
    await page.goto("/registro");
    await fill(page, { "Correo electrónico": EMAIL, "Contraseña": PASSWORD, "Confirmar contraseña": PASSWORD });
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(/Si el correo puede registrarse/)).toBeVisible();

    // Sin confirmar no hay acceso, y el mensaje es el mismo que con una contraseña errónea.
    await page.goto("/acceso");
    await fill(page, { "Correo electrónico": EMAIL, "Contraseña": PASSWORD });
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    expect(await hasSessionCookie(page)).toBe(false);

    // Confirmación desde el buzón local.
    await page.goto(await nextLinkFor(EMAIL, seen));
    await expect(page).toHaveURL(/\/acceso\?aviso=confirmado$/);
    await expect(page.getByTestId("auth-notice")).toContainText("Cuenta confirmada");
    expect(page.url()).not.toContain("code=");

    // Acceso y guarda de sesión.
    await fill(page, { "Correo electrónico": EMAIL, "Contraseña": PASSWORD });
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await hasSessionCookie(page)).toBe(true);
    await page.goto("/nueva-contrasena");
    await expect(page).toHaveURL(/\/nueva-contrasena$/);

    // Cierre de sesión (la UI de logout la monta MVP-116): mismo origen, desde la página.
    const logout = await page.evaluate(async () => (await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } })).status);
    expect(logout).toBe(200);
    expect(await hasSessionCookie(page)).toBe(false);
    await page.goto("/nueva-contrasena");
    await expect(page).toHaveURL(/\/recuperar\?aviso=enlace-invalido$/);

    // Recuperación.
    await fill(page, { "Correo electrónico": EMAIL });
    await page.getByRole("button", { name: "Solicitar recuperación" }).click();
    await expect(page.getByText(/Si el correo corresponde a una cuenta/)).toBeVisible();
    await page.goto(await nextLinkFor(EMAIL, seen));
    await expect(page).toHaveURL(/\/nueva-contrasena$/);
    expect(page.url()).not.toContain("code=");

    // Nueva contraseña y acceso con ella.
    await fill(page, { "Nueva contraseña": NEW_PASSWORD, "Confirmar nueva contraseña": NEW_PASSWORD });
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/acceso\?aviso=contrasena-actualizada$/);
    expect(await hasSessionCookie(page)).toBe(false);

    await fill(page, { "Correo electrónico": EMAIL, "Contraseña": PASSWORD });
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();

    await fill(page, { "Correo electrónico": EMAIL, "Contraseña": NEW_PASSWORD });
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await hasSessionCookie(page)).toBe(true);

    expect(consoleText.join("\n")).not.toContain(PASSWORD);
    expect(consoleText.join("\n")).not.toContain(NEW_PASSWORD);
  });

  test("mensajes uniformes: correo existente y desconocido reciben la misma respuesta", async ({ page, request, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const headers = { origin, "content-type": "application/json" };

    const recovery = async (email: string) => {
      const response = await request.post("/api/auth/recovery", { headers, data: { email } });
      return { status: response.status(), body: await response.json() };
    };
    expect(await recovery("nadie-" + stamp + "@galcoa-e2e.test")).toEqual(await recovery(EMAIL));

    // Alta repetida de una cuenta ya confirmada: misma respuesta que un alta nueva.
    const register = async (email: string) => {
      const response = await request.post("/api/auth/register", { headers, data: { email, password: PASSWORD, confirmPassword: PASSWORD } });
      return { status: response.status(), body: await response.json() };
    };
    expect(await register(EMAIL)).toEqual(await register(`otra-${stamp}@galcoa-e2e.test`));

    await page.goto("/acceso");
  });

  test("origen externo y destinos externos rechazados", async ({ request, baseURL }) => {
    const hostile = await request.post("/api/auth/login", {
      headers: { origin: "https://atacante.invalid", "content-type": "application/json" },
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(hostile.status()).toBe(403);

    const callback = await request.get("/api/auth/callback?flow=https://atacante.invalid&code=x", { maxRedirects: 0 });
    expect(callback.status()).toBe(303);
    const location = new URL(callback.headers()["location"]!, baseURL!);
    expect(location.origin).toBe(new URL(baseURL!).origin);
    expect(location.pathname + location.search).toBe("/acceso?aviso=enlace-invalido");
  });
});
