import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import { createExecutorRpc } from "./persistence/executor-rpc";
import { createDocumentStore } from "./persistence/store";
import type { DraftHttpDeps } from "./preview-http";
import { createSupabaseRevisionAdapters } from "./revisions/supabase";

/** Composición perezosa por petición del propietario; sin cliente compartido ni `service_role`. */
export const draftHttpDeps: DraftHttpDeps = {
  async getContext() {
    const client = await getSessionClient();
    const session = await verifySession(client);
    return {
      session,
      async readDraft(userId, documentId) {
        if (session.status !== "authenticated" || session.user.id !== userId) throw new Error("Sin sesión verificada");
        const executor = createExecutorRpc(userId);
        const document = await createDocumentStore({ verifiedUserId: userId, session: client, executor }).getDocument(userId, documentId);
        if (!document) return { status: "not_available" };
        const { reader } = createSupabaseRevisionAdapters({ verifiedUserId: userId, session: client, executor });
        const source = await reader.getFreezeSource(userId, documentId);
        return source ? { status: "ok", draft: source.draft } : { status: "no_draft" };
      },
    };
  },
};
