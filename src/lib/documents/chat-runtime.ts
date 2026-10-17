import "server-only";

import { createDraftingService } from "@/lib/ai/drafting/service";
import { createExtractionReader } from "@/lib/ai/extraction/service";
import { getGeminiStructuredPort } from "@/lib/ai/gemini/structured";
import { createContrastService } from "@/lib/ai/groq/contrast";
import { getGroqStructuredPort } from "@/lib/ai/groq/structured";
import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";

import type { ChatHttpDeps } from "./chat-http";
import { createContrastStore } from "./contrast/persistence";
import { createEvidenceStore } from "./evidence/persistence";
import { createMessageService } from "./messages";
import { createExecutorRpc } from "./persistence/executor-rpc";
import { createDocumentStore } from "./persistence/store";
import { createDraftReader } from "./revisions/draft-reader";
import { createDurableChatStore } from "./turns/persistence";
import { createTurnService } from "./turns/service";

/**
 * Composición real del chat y del contraste, por petición y tras `Auth.getUser()`: sesión del
 * propietario para lecturas/Storage, canal `galcoa_executor` con actor explícito para turnos,
 * evidencias y reportes. El borrador vigente se lee con la sesión (`get_freeze_source`).
 * Sin cliente compartido, `service_role` ni herramientas de blockchain para los agentes.
 */
export const chatHttpDeps: ChatHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    const session = await verifySession(client);
    return {
      session,
      forUser(userId) {
        if (session.status !== "authenticated" || session.user.id !== userId) throw new Error("Sin sesión verificada");
        const executor = createExecutorRpc(userId);
        if (!executor) throw new Error("Persistencia no disponible");
        const port = { currentUserId: async () => userId };
        const documents = createDocumentStore({ verifiedUserId: userId, session: client, executor });
        const messages = createMessageService(port, documents);
        const extractions = createExtractionReader(createEvidenceStore({ verifiedUserId: userId, executor }));
        const readDraft = createDraftReader({ verifiedUserId: userId, session: client });
        const turns = createDurableChatStore({ verifiedUserId: userId, executor });
        return {
          turns: createTurnService({
            session: port,
            turns,
            messages,
            documents,
            drafting: createDraftingService({ session: port, messages, stager: turns, gemini: getGeminiStructuredPort(), extractions }),
            currentDraftRevision: async (owner, documentId) => (await readDraft(owner, documentId))?.draftRevision ?? 0,
          }),
          contrast: createContrastService({
            session: port,
            messages,
            store: createContrastStore({ verifiedUserId: userId, executor, readDraft }),
            groq: getGroqStructuredPort(),
            extractions,
          }),
        };
      },
    };
  },
};
