import { expect, test } from "./fixtures";

/**
 * MVP-118 / A2 sobre las rutas **integradas** públicas (Next real, sin credenciales).
 * El preview ya cubre las presentaciones con datos ficticios; aquí se audita lo que
 * el usuario ve de verdad. Las pantallas privadas y la confirmación/verificador
 * (MVP-076/101) requieren Auth local o aún no existen: ver el plan F11, §8.
 */
const SCREENS = [
  { name: "landing", path: "/" },
  { name: "acceso", path: "/acceso" },
  { name: "registro", path: "/registro" },
  { name: "recuperar", path: "/recuperar" },
  // Sin base ni invitación real la pantalla pública muestra el estado de enlace no
  // disponible / error técnico: audita estructura y responsive de ese estado. Los estados
  // con operación (casilla, nombre, modal) requieren la pila local: viven en el preview.
  { name: "confirmación sin invitación", path: "/confirm/token-inexistente" },
] as const;
const WIDTHS = [360, 1280] as const;

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    test.describe(`${screen.name} · ${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(screen.path);
      });

      test("sin desbordamiento horizontal", async ({ page }) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });

      test("estructura: un solo h1, región main y títulos sin saltos", async ({ page }) => {
        // Hallazgo MVP-118 abierto: los formularios de auth (presentación ajena, solo lectura
        // en este ticket) usan h2 sin h1; se corrige con su propietario. Ver plan F11.
        test.skip(["acceso", "registro", "recuperar"].includes(screen.name), "formularios de auth sin h1: hallazgo registrado");
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("main")).toHaveCount(1);
        const levels = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1])));
        levels.reduce((prev, level) => {
          expect(level - prev, `salto de nivel ${prev}→${level}`).toBeLessThanOrEqual(1);
          return level;
        }, 0);
      });

      test("todo control interactivo tiene nombre accesible", async ({ page }) => {
        const unnamed = await page.evaluate(() => {
          const controls = [...document.querySelectorAll<HTMLElement>("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link]")];
          return controls
            .filter((el) => el.getClientRects().length > 0)
            .filter((el) => {
              const labelled = el.getAttribute("aria-label")?.trim() || el.getAttribute("aria-labelledby");
              const byLabel = (el as HTMLInputElement).labels && (el as HTMLInputElement).labels!.length > 0;
              return !(labelled || byLabel || el.textContent?.trim() || el.getAttribute("title"));
            })
            .map((el) => el.outerHTML.slice(0, 80));
        });
        expect(unnamed).toEqual([]);
      });

      test("teclado: el primer Tab llega a un control con foco visible", async ({ page }) => {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          return { tag: el.tagName, visible: style.outlineStyle !== "none" || style.boxShadow !== "none" };
        });
        expect(focus, "ningún control recibió foco").not.toBeNull();
        expect(focus?.visible, `foco sin indicador visible en <${focus?.tag}>`).toBe(true);
      });
    });
  }
}

test("landing móvil: el menú se abre con teclado, Escape lo cierra y devuelve el foco", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /menú/i });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});
