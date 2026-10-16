import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getGeminiStructuredPort } from "@/lib/ai/gemini/structured";
import { createExecutorRpc } from "../persistence/executor-rpc";
import type { EvidenceHttpDeps } from "./http";
import { createEvidenceStore } from "./persistence";
import { createEvidenceStorage } from "./storage";

export const evidenceHttpDeps: EvidenceHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    const session = await verifySession(client);
    let executor: ReturnType<typeof createExecutorRpc>;
    return {
      session,
      forUser(userId) {
        if (session.status !== "authenticated" || session.user.id !== userId) throw new Error("Sin sesión verificada");
        executor ??= createExecutorRpc(userId);
        if (!executor) throw new Error("Persistencia no disponible");
        const store = createEvidenceStore({ verifiedUserId: userId, executor });
        const storage = createEvidenceStorage({ verifiedUserId: userId, session: client, store });
        return { store, storage, gemini: getGeminiStructuredPort() };
      },
      async close() { await executor?.close(); },
    };
  },
};
