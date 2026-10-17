import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { createPdfStagingService } from "./staging";
import type { Phase } from "./phases";

/**
 * Avance de la finalización tras el claim o la reanudación (MVP-081+). El fencing sale del claim en el
 * servidor y se consume aquí: ni el cliente lo ve ni lo envía. Cada fase persiste su checkpoint antes de
 * pasar a la siguiente, de modo que una petición posterior retoma desde la última fase durable. Las fases
 * posteriores a `pdf_staged` se añaden a esta tabla; mientras no existan, la operación queda en su fase.
 */

export type AdvanceInput = { operationId: string; fencing: number; phase: Phase };
export type AdvanceResult = { ok: true; phase: Phase } | { ok: false; error: TechnicalError };
export type FinalizationAdvancer = { advance(input: AdvanceInput): Promise<AdvanceResult> };

export function createFinalizationAdvancer(deps: { staging: Pick<ReturnType<typeof createPdfStagingService>, "stagePdf"> }): FinalizationAdvancer {
  return {
    async advance({ operationId, fencing, phase }) {
      let current = phase;
      if (current === "reserved") {
        const staged = await deps.staging.stagePdf({ operationId, fencing });
        if (!staged.ok) return staged;
        current = "pdf_staged";
      }
      return { ok: true, phase: current };
    },
  };
}
