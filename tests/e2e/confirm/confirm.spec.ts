import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * MVP-076 · pantalla pública contra Supabase local real. Datos ficticios; los tokens
 * vienen del archivo que escribió la siembra y nunca se imprimen.
 */

type Seed = { confirm: string; reject: string; mobile: string };
const seed = (): Seed => JSON.parse(readFileSync(process.env.CONFIRM_E2E_SEED_FILE ?? "", "utf8"));

test.skip(process.env.CONFIRM_E2E !== "1", "Usá `npm run test:e2e:confirm`");

const name = (page: Page) => page.getByLabel("Nombre completo");
const confirmBtn = (page: Page) => page.getByRole("button", { name: "Confirmar" });
const rejectBtn = (page: Page) => page.getByRole("button", { name: "No coincide / Rechazar" });

test("confirmar: persiste, no muestra éxito antes y el enlace queda usado", async ({ page }) => {
  const { confirm } = seed();
  await page.goto(`/confirm/${confirm}`);
  await expect(page.getByRole("heading", { name: "Acuerdo ficticio de entrega" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Contraste de fuentes" })).toContainText("Semáforo Amarillo");
  await expect(page.getByRole("region", { name: "Contraste de fuentes" })).toContainText("declarados");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(confirmBtn(page)).toBeDisabled();
  await expect(page.getByText(/Registramos/)).toHaveCount(0);

  await name(page).fill("Juan Pérez");
  await page.getByRole("checkbox").check();
  await expect(confirmBtn(page)).toBeEnabled();
  await confirmBtn(page).click();
  await expect(page.getByRole("status")).toContainText("Registramos tu confirmación");
  await expect(page.getByRole("status")).toContainText("Confirmado mediante enlace");

  await page.reload();
  await expect(page.getByText("Este enlace ya fue usado")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("rechazar: Escape y Cancelar no envían; ratificar registra el rechazo", async ({ page }) => {
  const { reject } = seed();
  await page.goto(`/confirm/${reject}`);
  await name(page).fill("Ana Gómez");
  await expect(rejectBtn(page)).toBeEnabled();

  await rejectBtn(page).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await rejectBtn(page).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText(/Registramos/)).toHaveCount(0);

  await rejectBtn(page).click();
  await page.getByRole("button", { name: "Sí, rechazar" }).click();
  await expect(page.getByRole("status")).toContainText("Registramos que no coincide");
  await expect(page.getByRole("status")).toContainText("Rechazado mediante enlace");
});

test("celular de 375 px: sin desborde horizontal y controles con tamaño táctil", async ({ page }) => {
  const { mobile } = seed();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/confirm/${mobile}`);
  await expect(confirmBtn(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await confirmBtn(page).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("enlace inexistente: no disponible, sin formulario y sin indexar", async ({ page }) => {
  const response = await page.goto(`/confirm/${"x".repeat(43)}`);
  await expect(page.getByText("Enlace no disponible")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["cache-control"]).toContain("no-store");
});
