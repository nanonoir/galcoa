import "server-only";

import { redirect } from "next/navigation";

import type { SealedVersionView } from "@/lib/contracts/sealed-version-view";
import { createExecutorRpc } from "@/lib/documents/persistence/executor-rpc";
import { readLatestSealedVersion } from "@/lib/documents/sealing/sealed-version";
import { createSupabaseSealingStore } from "@/lib/documents/sealing/supabase";
import { LOGIN_PATH, SessionUnavailableError } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import { verifiedRequestSession } from "./session";

/**
 * Última versión publicada del documento del usuario de la petición, con su sello, para Server
 * Components. Es la fuente persistente del recuadro «Contrato subido»: sobrevive a recargas y a
 * volver al documento. Documento ajeno o sin versión: `null`.
 */
export async function sealedVersionForRequest(documentId: string): Promise<SealedVersionView | null> {
  const check = await verifiedRequestSession();
  if (check.status === "unavailable") throw new SessionUnavailableError();
  if (check.status === "anonymous") redirect(LOGIN_PATH);
  const userId = check.user.id;
  const executor = createExecutorRpc(userId);
  return readLatestSealedVersion({
    documentId,
    session: await getSessionClient(),
    sealing: executor ? createSupabaseSealingStore({ verifiedUserId: userId, executor }) : undefined,
  });
}
