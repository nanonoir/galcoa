import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { createManifestService } from "./manifest";
import type { Phase } from "./phases";
import type { createPdfStagingService } from "./staging";

/**
 * Avance de la finalización tras el claim o la reanudación (MVP-081+). El fencing sale del claim en el
 * servidor y se consume aquí: ni el cliente lo ve ni lo envía. Cada fase persiste su checkpoint antes de
 * pasar a la siguiente, de modo que una petición posterior retoma desde la última fase durable. Las fases
 * posteriores a `manifest_ready` se añaden a esta secuencia; mientras no existan, la operación queda en su fase.
 */

export type AdvanceInput = { operationId: string; fencing: number; phase: Phase };
export type AdvanceResult = { ok: true; phase: Phase } | { ok: false; error: TechnicalError };
export type FinalizationAdvancer = { advance(input: AdvanceInput): Promise<AdvanceResult> };

export function createFinalizationAdvancer(deps: {
  staging: Pick<ReturnType<typeof createPdfStagingService>, "stagePdf">;
  manifest: Pick<ReturnType<typeof createManifestService>, "prepareManifest">;
}): FinalizationAdvancer {
  return {
    async advance({ operationId, fencing, phase }) {
      let current = phase;
      if (current === "reserved") {
        const staged = await deps.staging.stagePdf({ operationId, fencing });
        if (!staged.ok) return staged;
        current = "pdf_staged";
      }
      if (current === "pdf_staged") {
        const prepared = await deps.manifest.prepareManifest({ operationId, fencing });
        if (!prepared.ok) return prepared;
        current = "manifest_ready";
      }
      return { ok: true, phase: current };
    },
  };
}
