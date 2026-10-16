import { expect, test as base } from "@playwright/test";

/**
 * `page` que bloquea todo lo que no sea loopback y falla si el navegador lo
 * intentó, o si hubo errores de consola/JS: el smoke no depende de red externa.
 */
export const test = base.extend<{ blocked: string[] }>({
  blocked: [
    async ({ page }, use) => {
      const blocked: string[] = [];
      const problems: string[] = [];
      await page.route("**/*", (route) => {
        const { hostname, protocol } = new URL(route.request().url());
        if (hostname === "127.0.0.1" || hostname === "localhost" || protocol === "data:" || protocol === "blob:") return route.continue();
        blocked.push(route.request().url());
        return route.abort();
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
      });
      await use(blocked);
      expect(blocked, "peticiones a red externa").toEqual([]);
      expect(problems, "errores de navegador").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
