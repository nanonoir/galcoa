import { expect, test } from "./fixtures";

/**
 * Smoke de arranque de Next sin credenciales. La página raíz sigue siendo la
 * plantilla de create-next-app: esto NO prueba flujos de negocio del producto.
 */
test.describe("arranque de Next (plantilla base)", () => {
  test("sirve y renderiza la raíz con estilos", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    // HTTP 200 no basta: comprobamos contenido y estilos renderizados.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const fontSize = await page.getByRole("heading", { level: 1 }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThan(20);
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
