import "server-only";

import { redirect } from "next/navigation";

import type { VersionHistoryViewState } from "@/lib/contracts/version-history-view";
import { createExecutorRpc } from "@/lib/documents/persistence/executor-rpc";
import { createSupabaseSealingStore } from "@/lib/documents/sealing/supabase";
import { readVersionHistory } from "@/lib/documents/sealing/version-history";
import { LOGIN_PATH, SessionUnavailableError } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import { verifiedRequestSession } from "./session";

/**
 * Historial de versiones finalizadas del documento del usuario de la petición, para Server Components.
 * Sesión verificada → cliente de sesión con RLS (+ canal del ejecutor solo para leer sellos). Un fallo
 * de lectura vuelve como estado `error`, nunca como lista vacía.
 */
export async function versionHistoryForRequest(documentId: string): Promise<VersionHistoryViewState> {
  const check = await verifiedRequestSession();
  if (check.status === "unavailable") throw new SessionUnavailableError();
  if (check.status === "anonymous") redirect(LOGIN_PATH);
  const userId = check.user.id;
  const executor = createExecutorRpc(userId);
  return readVersionHistory({
    documentId,
    session: await getSessionClient(),
    sealing: executor ? createSupabaseSealingStore({ verifiedUserId: userId, executor }) : undefined,
  });
}
