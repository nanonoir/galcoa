import "server-only";

import { readTrustedOrigins } from "@/lib/supabase/auth-http";
import type { EnvReader } from "@/lib/supabase/config";

/**
 * Enlace público del verificador para el QR del PDF final. Sale del origen canónico de la app
 * (`NEXT_PUBLIC_APP_URL`, el primero de la lista), nunca de la petición. Sin configuración devuelve
 * `null`: el PDF se genera igual, con la referencia escrita y sin QR.
 */
export function verifyUrlFor(publicReference: string, readEnv?: EnvReader): string | null {
  try {
    const [origin] = readTrustedOrigins(readEnv);
    return `${origin}/verify/${encodeURIComponent(publicReference)}`;
  } catch {
    return null;
  }
}
