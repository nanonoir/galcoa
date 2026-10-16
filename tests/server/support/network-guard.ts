/**
 * Bloquea la red de los tests con dobles (MVP-120; SH-09). Reemplaza `fetch` por una
 * función que lanza y registra el intento; `restore` devuelve el original.
 * No sustituye a un sandbox: comprueba que los dobles no salen por `fetch`.
 */
export function blockNetwork(): { attempts: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    attempts.push(target);
    return Promise.reject(new Error(`Red bloqueada en tests con dobles: ${target}`));
  }) as typeof fetch;
  return {
    attempts,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
