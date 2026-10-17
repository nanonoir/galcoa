import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";

import { createExecutorRpc } from "../persistence/executor-rpc";

import type { FinalizationHttpDeps } from "./http";
import { createManifestService, createSupabaseManifestStore } from "./manifest";
import { createFinalizationAdvancer } from "./resume";
import { createPdfStagingService, createSupabasePdfStagingStore } from "./staging";

/**
 * Composición por petición con la sesión del propietario; sin cliente compartido ni service_role.
 * Las fases se ejecutan por el canal `galcoa_executor` con el actor ya verificado.
 */
export const finalizationHttpDeps: FinalizationHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    return { session: await verifySession(client), rpc: client };
  },
  advancerFor(userId) {
    const executor = createExecutorRpc(userId);
    if (!executor) throw new Error("Persistencia no disponible");
    return createFinalizationAdvancer({
      staging: createPdfStagingService({ store: createSupabasePdfStagingStore({ verifiedUserId: userId, executor }) }),
      manifest: createManifestService({ store: createSupabaseManifestStore({ verifiedUserId: userId, executor }) }),
    });
  },
};
