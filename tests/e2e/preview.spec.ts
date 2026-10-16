import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const scenarios: Array<{ label: string; visible: RegExp | string }> = [
  { label: "Cargando", visible: "Cargando documentos" },
  { label: "Error técnico recuperable", visible: "No se pudo cargar la lista de documentos" },
  { label: "Lista vacía", visible: "Todavía no hay documentos" },
  { label: "Entrega comercial contradictoria (10 vs 12)", visible: /10 toneladas.*12 toneladas/ },
  { label: "Medición sin unidad", visible: /unidad/i },
  { label: "Confirmaciones pendientes", visible: "Confirmaciones" },
  { label: "Finalizada con sello HCS pendiente", visible: "Sello HCS" },
  { label: "Finalizada con sello HCS registrado", visible: "Registrado" },
];

const stage = (page: Page) => page.getByTestId("preview-stage");
const scenarioButton = (page: Page, label: string) => page.getByRole("group", { name: "Escenario" }).getByRole("button", { name: label, exact: true });

test.describe("preview local (datos ficticios)", () => {
  test("renderiza con estilos reales y declara datos ficticios", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note")).toContainText("Datos ficticios");
    await expect(page.getByRole("heading", { name: "Preview de presentación" })).toBeVisible();

    // Tailwind + tokens shadcn aplicados: el botón primario no es el botón crudo del navegador.
    const create = page.getByRole("button", { name: "Crear documento" });
    await expect(create).toBeVisible();
    const style = await create.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) };
    });
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.radius).toBeGreaterThan(0);
  });

  test("no inyecta entorno del proceso ni variables en el cliente", async ({ page }) => {
    await page.goto("/");
    const env = await page.evaluate(() => ({
      process: typeof (globalThis as { process?: unknown }).process,
    }));
    expect(env.process).toBe("undefined");
  });

  for (const scenario of scenarios) {
    test(`escenario «${scenario.label}»`, async ({ page }, testInfo) => {
      await page.goto("/");
      await scenarioButton(page, scenario.label).click();
      await expect(scenarioButton(page, scenario.label)).toHaveAttribute("aria-pressed", "true");
      await expect(stage(page).getByText(scenario.visible).first()).toBeVisible();
      await testInfo.attach(`escenario-${scenario.label}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }

  test("callbacks: solo eventos locales, sin red ni persistencia", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url());
    });

    await scenarioButton(page, "Entrega comercial contradictoria (10 vs 12)").click();
    await page.getByRole("button", { name: "Crear documento" }).click();
    await page.getByRole("button", { name: /^Abrir / }).click();
    const events = page.getByRole("complementary");
    await expect(events.getByRole("listitem")).toHaveText(['onOpen("doc-comercial-001")', "onCreate()"]);

    await scenarioButton(page, "Error técnico recuperable").click();
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(events.getByRole("listitem").first()).toHaveText("onRetry()");
    expect(requests, "peticiones fetch/xhr tras interactuar").toEqual([]);

    // Pérdida de estado al recargar: no hay persistencia.
    await page.reload();
    await expect(events).toContainText("Sin eventos");
    await expect(scenarioButton(page, "Cargando")).toHaveAttribute("aria-pressed", "true");
  });

  test("responsive: sin desbordamiento horizontal en ancho móvil", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await scenarioButton(page, "Entrega comercial contradictoria (10 vs 12)").click();
    await expect(stage(page).getByRole("heading", { level: 3 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("el selector es operable con teclado", async ({ page }) => {
    await page.goto("/");
    const target = scenarioButton(page, "Lista vacía");
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await expect(stage(page).getByText("Todavía no hay documentos")).toBeVisible();
  });
});
