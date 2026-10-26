import "server-only";

import { getCurrentSession } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import type { ConversionHttpDeps } from "./http";

/**
 * Cableado real: el cliente de sesión de la petición (clave pública + cookies).
 * Sin sesión actúa como `anon`, que solo puede ejecutar `record_funnel_event`;
 * con sesión, `auth.uid()` identifica al usuario en ambas funciones SQL.
 */
export const conversionHttpDeps: ConversionHttpDeps = {
  rpc: async () => {
    const client = await getSessionClient();
    return async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      return { data, error };
    };
  },
  session: getCurrentSession,
};
