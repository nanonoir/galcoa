import type { AlcEvaluation } from "@/lib/documents/alc/service";
import { createFreezeHandler } from "@/lib/documents/revisions/http";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";
import { failure } from "@/lib/documents/result";

import { createLocalAuthContext, type LocalAuthContextInput } from "../../server/bridge/entry";

/**
 * Puente SOLO del runner Node, jamás importado por Next. Auth, congelado y SQL son
 * reales locales; la evaluación se prepara en el seed con hechos ficticios en lugar
 * de llamar a Groq. No agrega rutas ni excepciones de elegibilidad al producto.
 */
export async function freezeLocally(input: LocalAuthContextInput, evaluations: Record<string, AlcEvaluation>, request: Request, documentId: string) {
  const context = createLocalAuthContext(input);
  const userId = await context.session.currentUserId();
  if (!userId) return Response.json({ error: { code: "NO_SESSION" } }, { status: 401 });
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: userId, session: context.rpc });
  const service = createRevisionService({
    session: context.session, source: reader, revisions: store,
    alc: {
      evaluate: async (evaluationInput) => {
        const key = `${evaluationInput.documentId}:${evaluationInput.selection.join(",")}`;
        const value = evaluations[key];
        if (evaluationInput.draft.revision !== 1 || evaluationInput.ownerId !== userId || !value) {
          return failure("NOT_AVAILABLE", "persistencia", false, "e2e-local-only");
        }
        return { ok: true, value };
      },
    },
  });
  return createFreezeHandler(async () => service)(request, documentId);
}
