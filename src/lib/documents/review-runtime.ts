import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";
import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";

import { createRateLimiter } from "./confirmations/rate-limit";
import { createSupabaseRateLimitStore } from "./confirmations/supabase";
import { createInvitationService } from "./invitations/service";
import { createSupabaseInvitationStore } from "./invitations/supabase";
import type { ReviewHttpDeps } from "./review-http";

/** Composición perezosa por petición del propietario; sin cliente compartido ni service_role. */
export const reviewHttpDeps: ReviewHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    return { session: await verifySession(client), rpc: client };
  },
};

/** Servicios públicos: cliente anónimo por petición; sin sesión ni identidad de usuario. */
export function createPublicReview() {
  const rpc = createAnonClient();
  return {
    invitations: createInvitationService({
      session: { currentUserId: async () => null },
      invitations: createSupabaseInvitationStore({ verifiedUserId: null, rpc }),
    }),
    limiter: createRateLimiter({ store: createSupabaseRateLimitStore(rpc) }),
  };
}
