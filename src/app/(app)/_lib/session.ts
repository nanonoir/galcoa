import "server-only";

import { cache } from "react";

import { verifySession, type SessionCheck } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

/**
 * Sesión verificada **una sola vez por petición**: el layout y la página la
 * comparten, en vez de pedir `auth.getUser()` al proveedor dos veces. `cache`
 * de React solo deduplica dentro de un mismo render de servidor.
 */
export const verifiedRequestSession = cache(async (): Promise<SessionCheck> => verifySession(await getSessionClient()));
