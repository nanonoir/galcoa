import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";
import { createHcsClient } from "@/lib/hedera/client";
import { createMirrorReader } from "@/lib/hedera/mirror";

import { createExecutorRpc } from "../persistence/executor-rpc";
import { createSealingService } from "../sealing/service";
import { createSupabaseSealingStore } from "../sealing/supabase";

import { createArtifactStorage } from "./artifact-storage";
import type { FinalizationHttpDeps } from "./http";
import { createManifestService, createSupabaseManifestStore } from "./manifest";
import { createSupabaseVersionPublishStore, createVersionPublishService } from "./publish";
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
      publisher: createVersionPublishService({
        store: createSupabaseVersionPublishStore({ verifiedUserId: userId, executor }),
        storage: createArtifactStorage({ verifiedUserId: userId }),
      }),
    });
  },
  sealerFor(userId) {
    const executor = createExecutorRpc(userId);
    if (!executor) throw new Error("Persistencia no disponible");
    return createSealingService({
      store: createSupabaseSealingStore({ verifiedUserId: userId, executor }),
      client: createHcsClient(),
      mirror: createMirrorReader(),
    });
  },
};
