import type { TestClock } from "../support/clock";

/**
 * Comportamiento guionado para dobles de proveedores (MVP-120; SH-09). No define ningún
 * contrato de servicio: cada doble concreto lo envuelve y respeta el puerto real de su
 * tarea (Groq 053, Storage 083, HCS/Mirror 090). Sin red, sin SDK y sin credenciales.
 *
 * El guion se consume en orden; el último paso se repite. El estado vive en la
 * instancia, nunca en módulo, para no filtrarse entre tests.
 */

export type Step<T> =
  | { kind: "ok"; value: T }
  | { kind: "fail"; error: unknown }
  /** Respuesta que viola el contrato a propósito (salida inválida contra Zod). */
  | { kind: "invalid"; value: unknown }
  /** No responde hasta que se aborta la señal. */
  | { kind: "hang" }
  /** El efecto ocurrió (`effect`) pero el llamador solo ve un error (p. ej. timeout de HCS). */
  | { kind: "uncertain"; effect?: () => void; error?: unknown }
  /** Espera tiempo simulado antes del paso siguiente. */
  | { kind: "delay"; ms: number; then: Step<T> };

export class UncertainOutcomeError extends Error {
  constructor() {
    super("Resultado incierto: la operación pudo haberse aplicado");
    this.name = "UncertainOutcomeError";
  }
}

export type RecordedInvocation<I> = { input: I; index: number };

export class ScriptedBehavior<I, T> {
  readonly calls: RecordedInvocation<I>[] = [];
  private cursor = 0;

  constructor(
    private readonly steps: readonly Step<T>[],
    private readonly clock?: TestClock,
  ) {
    if (steps.length === 0) throw new Error("Un guion necesita al menos un paso");
  }

  /** Ejecuta el siguiente paso. `invalid` devuelve el valor tal cual (el llamador debe validarlo). */
  async run(input: I, signal?: AbortSignal): Promise<T> {
    const index = this.calls.length;
    this.calls.push({ input, index });
    const step = this.steps[Math.min(this.cursor, this.steps.length - 1)];
    this.cursor += 1;
    return this.execute(step, signal);
  }

  private async execute(step: Step<T>, signal?: AbortSignal): Promise<T> {
    switch (step.kind) {
      case "ok":
        return step.value;
      case "invalid":
        return step.value as T;
      case "fail":
        throw step.error;
      case "uncertain":
        step.effect?.();
        throw step.error ?? new UncertainOutcomeError();
      case "hang":
        return new Promise<T>((_, reject) => {
          if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          signal?.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
        });
      case "delay": {
        if (!this.clock) throw new Error("El paso «delay» requiere un reloj de test");
        await this.clock.sleep(step.ms, signal);
        return this.execute(step.then, signal);
      }
    }
  }
}
