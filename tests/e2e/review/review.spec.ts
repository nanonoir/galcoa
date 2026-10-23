import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { count, value } from "./db";
import type { AlcEvaluation } from "@/lib/documents/alc/service";
import type { freezeLocally } from "./bridge-entry";

/**
 * Flujo del autor (#21; MVP-077/078) contra Supabase local real y el producto sin mocks:
 * ruta de revisión, congelado SQL, enlaces por tercero, QR/copiar/WhatsApp/correo sin envío,
 * recarga sin reemisión, nueva revisión sin herencia y `unchanged`. La evaluación del congelado
 * usa hechos ficticios persistidos en el seed mediante un puente de test Node, sin Groq real.
 * No acredita el runtime de extracción IA de Next. Cuenta y datos ficticios
 * (sin IA ni Hedera). Los enlaces son capacidades: las aserciones comparan booleanos para que
 * un fallo nunca imprima un token, y no hay trazas ni capturas.
 */

type Seed = { email: string; password: string; documents: Record<string, string>; evaluations: Record<string, AlcEvaluation>; bridgeUrl: string };
const seed = (): Seed => JSON.parse(readFileSync(process.env.REVIEW_E2E_SEED_FILE ?? "", "utf8"));

test.skip(process.env.REVIEW_E2E !== "1", "Usá `npm run test:e2e:review`");
test.describe.configure({ mode: "serial" });

type Role = "Transportista" | "Comprador";
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
const LINK_SHAPE = /^http:\/\/127\.0\.0\.1:\d+\/confirm\/[A-Za-z0-9_-]{20,}$/;
const FORBIDDEN_WORDS = /certificad|validad[oa]|garantizad|firma digital|identidad verificada/i;
let freezeBridge: typeof freezeLocally;

test.beforeAll(async () => {
  freezeBridge = (await import(seed().bridgeUrl)).freezeLocally;
});

/** Bloquea y registra (solo el host) todo lo que no sea loopback; registra mutaciones de la API. */
function watch(context: BrowserContext, page?: Page) {
  const blocked: string[] = [];
  const mutations: string[] = [];
  void context.route(
    (url) => /^https?:$/.test(url.protocol) && !LOOPBACK.has(url.hostname),
    (route) => {
      blocked.push(new URL(route.request().url()).hostname);
      return route.abort();
    },
  );
  // Solo el POST de congelado usa la composición de prueba; invitaciones,
  // confirmaciones, páginas y lecturas siguen pasando por Next y Supabase locales.
  void context.route(/\/api\/documents\/[0-9a-f-]{36}\/revisions$/, async (route) => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    if (!LOOPBACK.has(url.hostname) || incoming.method() !== "POST" || incoming.headers().origin !== url.origin) {
      return route.fulfill({ status: 403, json: { error: { code: "FORBIDDEN" } } });
    }
    const response = await freezeBridge({
      url: process.env.REVIEW_E2E_SUPABASE_URL ?? "",
      publishableKey: process.env.REVIEW_E2E_PUBLISHABLE_KEY ?? "",
      cookies: await context.cookies(),
    }, seed().evaluations, new Request(url, {
      method: "POST", headers: incoming.headers(), body: incoming.postData(),
    }), url.pathname.split("/")[3]);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  page?.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() !== "GET" && pathname.startsWith("/api/")) mutations.push(`${request.method()} ${pathname.replace(/[0-9a-f-]{36}/g, ":id")}`);
  });
  return { blocked, mutations };
}

async function login(page: Page) {
  const { email, password } = seed();
  await page.goto("/acceso");
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const card = (page: Page, role: Role) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name: role }) });
const linkOf = async (item: Locator) => ((await item.locator("p.tech-id").first().textContent()) ?? "").trim();
const checkbox = (page: Page, role: Role) => page.getByRole("checkbox", { name: role === "Comprador" ? "Comprador: siempre incluido" : role, exact: true });
const freezeButton = (page: Page) => page.getByRole("button", { name: "Congelar y generar enlaces" });
const newRevisionButton = (page: Page) => page.getByRole("button", { name: "Crear nueva revisión y generar enlaces" });
const authorBox = (page: Page) => page.getByLabel("Revisé la operación y confirmo esta versión.");

const sqlRevisions = (documentId: string) => count(`select count(*) from public.document_revisions where document_id = '${documentId}'`);
const sqlRequests = (documentId: string) => count(`select count(*) from public.corroboration_requests where document_id = '${documentId}'`);
const revisionId = (documentId: string, sequence: number) => value(`select id from public.document_revisions where document_id = '${documentId}' and sequence = ${sequence}`);

async function openReview(page: Page, documentId: string) {
  await page.goto(`/documents/${documentId}/review`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Revisión de");
}

async function freeze(page: Page, roles: Role[]) {
  for (const role of roles) {
    if (role === "Comprador") await expect(checkbox(page, role)).toBeChecked();
    else await checkbox(page, role).check();
  }
  await freezeButton(page).click();
  for (const role of roles) await expect(card(page, role).getByRole("button", { name: /Copiar enlace/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar como proveedor" })).toBeVisible();
}

async function confirmAsAuthor(page: Page) {
  await authorBox(page).check();
  await page.getByRole("button", { name: "Confirmar como proveedor" }).click();
  await expect(page.getByRole("button", { name: "Ya confirmaste" })).toBeVisible();
}

/** Comprueba copiar, QR, WhatsApp y correo de un tercero sin abrir nada fuera de la app. */
async function checkSharing(page: Page, role: Role, url: string, otherUrls: string[]) {
  const item = card(page, role);
  const who = role.toLowerCase();
  expect(LINK_SHAPE.test(url), `enlace de ${who} con forma esperada`).toBe(true);

  const qr = item.getByRole("img", { name: `Código QR del enlace de ${who}` });
  await expect(qr).toBeVisible();
  expect(await qr.locator("path").count(), `QR de ${who} dibujado como SVG local`).toBeGreaterThan(0);
  expect(await item.locator("img").count(), `sin imágenes remotas en la tarjeta de ${who}`).toBe(0);

  await item.getByRole("button", { name: `Copiar enlace de ${who}` }).click();
  await expect(item.getByRole("button", { name: `Copiar enlace de ${who}` })).toContainText("Copiado");
  expect((await page.evaluate(() => navigator.clipboard.readText())) === url, `portapapeles de ${who} igual a su enlace`).toBe(true);

  const wa = item.getByRole("link", { name: `Abrir WhatsApp para ${who}` });
  const waHref = (await wa.getAttribute("href")) ?? "";
  expect(waHref.startsWith("https://wa.me/?text="), "wa.me prearmado").toBe(true);
  const waText = decodeURIComponent(waHref.slice("https://wa.me/?text=".length));
  const mailHref = (await item.getByRole("link", { name: `Abrir correo para ${who}` }).getAttribute("href")) ?? "";
  expect(mailHref.startsWith("mailto:?subject="), "mailto prearmado").toBe(true);
  const mailBody = decodeURIComponent(mailHref.split("&body=")[1] ?? "");
  expect(await wa.getAttribute("target")).toBe("_blank");
  expect(await wa.getAttribute("rel")).toContain("noopener");

  const { email } = seed();
  for (const [label, text] of [["WhatsApp", waText], ["correo", mailBody]] as const) {
    expect(text.includes(url), `${label} de ${who} contiene su propio enlace`).toBe(true);
    expect(otherUrls.some((other) => text.includes(other)), `${label} de ${who} sin el enlace de otro`).toBe(false);
    expect(/cajas|Acuerdo ficticio|Documento ficticio/.test(text) || text.includes(email), `${label} sin contenido de la operación ni datos del autor`).toBe(false);
    expect(FORBIDDEN_WORDS.test(text), `${label} sin lenguaje prohibido`).toBe(false);
  }
}

const SELECTIONS: { key: string; roles: Role[]; stored: string }[] = [
  { key: "comprador", roles: ["Comprador"], stored: "autor,comprador" },
  { key: "ambos", roles: ["Transportista", "Comprador"], stored: "autor,intermediario,comprador" },
];

test.describe("revisión del autor (E2E real local)", () => {
  for (const { key, roles, stored } of SELECTIONS) {
    test(`selección «${key}»: congela, enlaces individuales, compartir sin envío y recarga sin reemisión`, async ({ page }) => {
      const { documents } = seed();
      const documentId = documents[key]!;
      const guard = watch(page.context(), page);
      await login(page);

      // Desde la ficha del documento hay una entrada a la revisión.
      await page.goto(`/documents/${documentId}`);
      await page.getByRole("link", { name: /revis/i }).first().click();
      await expect(page).toHaveURL(new RegExp(`/documents/${documentId}/review$`));
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Revisión de");

      // Proveedor y comprador son obligatorios; solo el transportista es opcional.
      await expect(page.getByRole("checkbox", { name: /Proveedor.*siempre incluido/ })).toBeDisabled();
      await expect(checkbox(page, "Comprador")).toBeChecked();
      await expect(checkbox(page, "Comprador")).toBeDisabled();
      await expect(freezeButton(page)).toBeEnabled();
      await freeze(page, roles);

      // Persistencia real del congelado.
      expect(await sqlRevisions(documentId), "una revisión congelada").toBe(1);
      expect(value(`select array_to_string(selection, ',') from public.document_revisions where document_id = '${documentId}'`)).toBe(stored);
      expect(await sqlRequests(documentId), "una invitación por tercero").toBe(roles.length);
      expect(count(`select count(*) from public.revision_participants where document_id = '${documentId}'`)).toBe(roles.length + 1);

      // Un enlace distinto por tercero y compartir sin salir de loopback.
      const urls: Record<string, string> = {};
      for (const role of roles) urls[role] = await linkOf(card(page, role));
      expect(new Set(Object.values(urls)).size, "enlaces distintos por tercero").toBe(roles.length);
      for (const role of roles) await checkSharing(page, role, urls[role]!, Object.entries(urls).filter(([r]) => r !== role).map(([, u]) => u));
      await expect(page.getByText("la aplicación no manda correos ni mensajes")).toBeVisible();

      // Tres indicadores separados.
      const progress = page.getByRole("region", { name: /Avance de la revisión/ });
      await expect(progress.getByText(/Confirmaciones · Revisión actual/)).toBeVisible();
      await expect(progress.getByText("Finalización de la versión", { exact: true })).toBeVisible();
      await expect(progress.getByText("Registro en Hedera (independiente de la finalización)", { exact: true })).toBeVisible();

      // Confirmación del autor persistida.
      await confirmAsAuthor(page);
      expect(count(`select count(*) from public.corroboration_responses where document_id = '${documentId}' and role = 'autor' and decision = 'confirmada'`)).toBe(1);
      if (roles.length === 0) await expect(page.getByText("Todos confirmaron")).toBeVisible();
      else await expect(page.getByText(/Faltan confirmaciones|Confirmaciones parciales/)).toBeVisible();

      // Recarga: misma revisión, selección fija, sin reemitir ni congelar de nuevo.
      guard.mutations.length = 0;
      await page.reload();
      await expect(page.getByRole("heading", { level: 2, name: "Compartir con los participantes" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ya confirmaste" })).toBeVisible();
      for (const role of roles) {
        await expect(checkbox(page, role)).toBeChecked();
        await expect(checkbox(page, role)).toBeDisabled();
        await expect(card(page, role).getByText(/ya no se puede mostrar/)).toBeVisible();
        await expect(card(page, role).getByRole("img")).toHaveCount(0);
      }
      await page.waitForTimeout(500);
      expect(guard.mutations, "la recarga no muta nada").toEqual([]);
      expect(await sqlRevisions(documentId)).toBe(1);
      expect(await sqlRequests(documentId)).toBe(roles.length);

      expect(guard.blocked, "ninguna petición salió de loopback").toEqual([]);
    });
  }

  test("nueva selección: otra revisión, enlaces viejos sin efecto, sin herencia; cancelar no hace POST", async ({ page, browser }) => {
    const documentId = seed().documents["cambio"]!;
    const guard = watch(page.context(), page);
    await login(page);
    await openReview(page, documentId);
    await freeze(page, ["Transportista", "Comprador"]);
    const oldInter = await linkOf(card(page, "Transportista"));
    const oldBuyer = await linkOf(card(page, "Comprador"));
    await confirmAsAuthor(page);

    // El transportista responde primero; el comprador sigue pendiente.
    const other = await browser.newContext();
    try {
      const guest = watch(other);
      const buyerPage = await other.newPage();
      await buyerPage.goto(oldInter);
      await buyerPage.getByLabel("Nombre completo").fill("Juan Pérez");
      await buyerPage.getByRole("checkbox").check();
      await buyerPage.getByRole("button", { name: "Confirmar" }).click();
      await expect(buyerPage.getByRole("status")).toContainText("Registramos tu confirmación");

      const rev1 = revisionId(documentId, 1);
      expect(count(`select count(*) from public.corroboration_responses where revision_id = '${rev1}'`), "proveedor y transportista respondieron la revisión 1").toBe(2);

      // Cancelar la edición no envía nada.
      guard.mutations.length = 0;
      await page.getByRole("button", { name: "Actualizar avance" }).click();
      await page.getByRole("button", { name: "Modificar participantes" }).click();
      await expect(checkbox(page, "Transportista")).toBeEnabled();
      await checkbox(page, "Transportista").uncheck();
      await page.getByRole("button", { name: "Cancelar y conservar la revisión actual" }).click();
      await expect(checkbox(page, "Transportista")).toBeChecked();
      await expect(checkbox(page, "Transportista")).toBeDisabled();
      expect(guard.mutations.filter((m) => m.startsWith("POST")), "cancelar no hace POST").toEqual([]);
      expect(await sqlRevisions(documentId)).toBe(1);

      // Selección nueva (sin intermediario) ⇒ otra revisión; mientras se edita, la vigente no cambia.
      await page.getByRole("button", { name: "Modificar participantes" }).click();
      await checkbox(page, "Transportista").uncheck();
      expect(await sqlRevisions(documentId), "editar no crea revisión").toBe(1);
      await newRevisionButton(page).click();
      await expect(card(page, "Comprador").getByRole("button", { name: /Copiar enlace/ })).toBeVisible();
      await expect(card(page, "Transportista")).toHaveCount(0);

      const newBuyer = await linkOf(card(page, "Comprador"));
      expect(newBuyer !== oldBuyer, "enlace nuevo distinto del anterior").toBe(true);
      expect(await sqlRevisions(documentId)).toBe(2);
      const rev2 = revisionId(documentId, 2);
      expect(value(`select lifecycle from public.document_revisions where id = '${rev1}'`)).toBe("sustituida");
      expect(value(`select lifecycle from public.document_revisions where id = '${rev2}'`)).toBe("activa");
      expect(value(`select array_to_string(selection, ',') from public.document_revisions where id = '${rev2}'`)).toBe("autor,comprador");

      // Sin herencia: nada respondido en la revisión 2 y la historia de la 1 se conserva.
      expect(count(`select count(*) from public.corroboration_responses where revision_id = '${rev2}'`), "la revisión 2 no hereda respuestas").toBe(0);
      expect(count(`select count(*) from public.corroboration_responses where revision_id = '${rev1}'`)).toBe(2);
      await expect(page.getByRole("button", { name: "Confirmar como proveedor" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ya confirmaste" })).toHaveCount(0);
      await expect(page.getByText(/Faltan confirmaciones/)).toBeVisible();

      // Los enlaces de la revisión 1 que seguían vivos quedaron revocados.
      expect(count(`select count(*) from public.corroboration_requests where revision_id = '${rev1}' and consumed_at is null and revoked_at is null`), "sin enlaces vivos en la revisión 1").toBe(0);
      expect(count(`select count(*) from public.corroboration_requests where revision_id = '${rev1}' and revoked_at is not null`)).toBe(1);

      // El enlace viejo del comprador (sin consumir) ya no permite responder.
      const stale = await other.newPage();
      await stale.goto(oldBuyer);
      await expect(stale.getByText(/Esta revisión fue reemplazada|Enlace no disponible/)).toBeVisible();
      await expect(stale.getByRole("checkbox")).toHaveCount(0);
      await expect(stale.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
      expect(count(`select count(*) from public.corroboration_responses where revision_id = '${rev1}' and role = 'comprador'`), "el enlace viejo no registró respuesta").toBe(0);

      // El enlace nuevo sí funciona y es de la revisión nueva.
      const fresh = await other.newPage();
      await fresh.goto(newBuyer);
      await expect(fresh.getByRole("checkbox")).toBeVisible();
      expect(guest.blocked, "el invitado tampoco salió de loopback").toEqual([]);
    } finally {
      await other.close();
    }
    expect(guard.blocked).toEqual([]);
  });

  test("sin cambios: repetir el congelado devuelve la misma revisión y no reemite enlaces", async ({ page, baseURL }) => {
    const documentId = seed().documents["sin-cambio"]!;
    watch(page.context(), page);
    await login(page);
    await openReview(page, documentId);
    await freeze(page, ["Comprador"]);
    const rev1 = revisionId(documentId, 1);

    const result = await page.evaluate(async ({ url, key }) => {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDraftRevision: 1, selection: ["comprador"], idempotencyKey: key }) });
      return { status: response.status, body: await response.json() };
    }, { url: new URL(`/api/documents/${documentId}/revisions`, baseURL).href, key: randomUUID() });
    expect(result.status).toBe(200);
    const body = result.body as { unchanged?: boolean; revision?: { revisionId?: string } };
    expect(body.unchanged, "el servidor informa unchanged").toBe(true);
    expect(body.revision?.revisionId === rev1, "misma revisión").toBe(true);
    expect(await sqlRevisions(documentId)).toBe(1);
    expect(await sqlRequests(documentId), "no se emitieron enlaces nuevos").toBe(1);
    expect(count(`select count(*) from public.corroboration_requests where document_id = '${documentId}' and revoked_at is not null`)).toBe(0);
  });
});
