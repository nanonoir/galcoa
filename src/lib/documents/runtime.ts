import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";

import type { DocumentHttpDeps } from "./http";
import { createDocumentStore } from "./persistence/store";

/** Composición perezosa por request; no hay cliente compartido ni service_role. */
export const documentHttpDeps: DocumentHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    const session = await verifySession(client);
    return {
      session,
      storeForUser(userId) {
        if (session.status !== "authenticated" || session.user.id !== userId) throw new Error("Sin sesión verificada");
        return createDocumentStore({ verifiedUserId: userId, session: client });
      },
    };
  },
};
