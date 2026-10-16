import "server-only";

import type { SessionPort } from "../ports";
import { failure, newId, type ServiceDeps, type ServiceResult } from "../result";

import { computeAggregate, type ConfirmationAggregate } from "./aggregate";
import type { AggregateStore } from "./ports";

/**
 * Lectura del estado agregado para el autor (MVP-075). El cálculo ocurre en
 * servidor sobre las respuestas persistidas; el cliente nunca decide el
 * estado. Una revisión ajena y una inexistente responden igual.
 */

export type AggregateDeps = ServiceDeps & {
  session: SessionPort;
  store: AggregateStore;
};

export function createAggregateService(deps: AggregateDeps) {
  const correlation = deps.newCorrelationId ?? newId;
  return {
    async getForAuthor(revisionId: unknown): Promise<ServiceResult<ConfirmationAggregate>> {
      const correlationId = correlation();
      const ownerId = await deps.session.currentUserId();
      if (!ownerId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      if (typeof revisionId !== "string" || revisionId.length === 0) return failure("INVALID_INPUT", "validacion", false, correlationId);
      try {
        const state = await deps.store.getRevisionState(ownerId, revisionId);
        if (!state) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return {
          ok: true,
          value: computeAggregate({
            revisionId: state.revisionId,
            snapshotId: state.snapshotId,
            selection: state.selection,
            responses: state.responses,
            superseded: state.superseded,
          }),
        };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
