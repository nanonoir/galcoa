/**
 * Reloj controlable de los tests de servidor (MVP-120). No toca timers globales:
 * el código bajo prueba recibe `now`/`sleep` por inyección explícita.
 */

export type TestClock = {
  now(): Date;
  nowMs(): number;
  /** Espera `ms` de tiempo simulado; se resuelve con `advance`. Rechaza si se aborta. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Avanza el reloj y resuelve, en orden, las esperas vencidas. */
  advance(ms: number): Promise<void>;
  /** Esperas pendientes (útil para afirmar que algo sigue colgado). */
  pending(): number;
};

export const FIXED_START = "2026-01-15T12:00:00.000Z";

export function createTestClock(start: string | number | Date = FIXED_START): TestClock {
  let current = new Date(start).getTime();
  if (Number.isNaN(current)) throw new Error("Instante inicial inválido para el reloj de test");
  const waiters: { due: number; resolve: () => void }[] = [];

  return {
    now: () => new Date(current),
    nowMs: () => current,
    sleep(ms, signal) {
      if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return new Promise<void>((resolve, reject) => {
        const waiter = { due: current + ms, resolve };
        waiters.push(waiter);
        signal?.addEventListener(
          "abort",
          () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    },
    async advance(ms) {
      const target = current + ms;
      for (;;) {
        const next = waiters.filter((w) => w.due <= target).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        current = next.due;
        waiters.splice(waiters.indexOf(next), 1);
        next.resolve();
        await Promise.resolve(); // cede el turno a quien esperaba
      }
      current = target;
    },
    pending: () => waiters.length,
  };
}
