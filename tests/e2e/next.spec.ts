import { expect, test } from "./fixtures";

/**
 * Smoke de arranque de Next sin credenciales: landing pública y guardas de las
 * rutas privadas. NO prueba flujos con datos reales (crear/reabrir requieren la
 * base local de MVP-120).
 */
test.describe("arranque de Next (landing y guardas)", () => {
  test("la raíz muestra la landing con enlaces de visitante", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Registros con respaldo, rastro y control de calidad" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
    await expect(page.getByRole("link", { name: "Ingresar" }).first()).toHaveAttribute("href", "/acceso");
  });

  test("rutas privadas fallan cerradas sin configuración de Auth (error técnico, nunca contenido)", async ({ request }) => {
    // Sin Supabase configurado la sesión no puede verificarse: error técnico, no «anónimo» ni 200.
    // La redirección a /acceso con sesión ausente se prueba con Auth local (auth-flow.spec.ts).
    for (const route of ["/dashboard", "/documents/00000000-0000-4000-8000-000000000000"]) {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status(), route).toBe(500);
      expect(await response.text(), route).not.toContain("Crear documento");
    }
  });

  test("sirve y renderiza la raíz con estilos", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    // HTTP 200 no basta: comprobamos contenido y estilos renderizados.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const fontSize = await page.getByRole("heading", { level: 1 }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThan(20);
  });

  test("una ruta inexistente responde 404", async ({ request }) => {
    const response = await request.get("/no-existe-esta-ruta");
    expect(response.status()).toBe(404);
  });

  test("no expone rutas mock/preview en la aplicación", async ({ request }) => {
    // Se usa `request` (mismo baseURL, sin navegador) para no generar el
    // console.error esperado del 404 que el guard global trataría como fallo.
    for (const route of ["/preview", "/mock", "/mocks", "/dashboard-preview"]) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(404);
    }
  });
});
