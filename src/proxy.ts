import type { NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/refresh";

/** Proxy de Next 16 (antes `middleware`): solo refresca las cookies de sesión de Supabase (MVP-030). */
export function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  // Fuera de estáticos e imágenes: la sesión no se toca para assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
