import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import { getSessionClient } from "@/lib/supabase/session";

import type { FinalizationHttpDeps } from "./http";

/** Composición por petición con la sesión del propietario; sin cliente compartido ni service_role. */
export const finalizationHttpDeps: FinalizationHttpDeps = {
  trustedOrigins: readTrustedOrigins,
  async getContext() {
    const client = await getSessionClient();
    return { session: await verifySession(client), rpc: client };
  },
};
