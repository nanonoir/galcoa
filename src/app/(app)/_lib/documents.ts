import "server-only";

import { redirect } from "next/navigation";

import { createDocumentService } from "@/lib/documents/documents";
import { createDocumentStore } from "@/lib/documents/persistence/store";
import { LOGIN_PATH, SessionUnavailableError } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import { verifiedRequestSession } from "./session";

/**
 * Servicio de documentos del usuario de la petición para Server Components
 * (MVP-116). Sin HTTP propio: sesión verificada → store con RLS → servicio.
 * Sin sesión redirige al acceso; si Auth falla es un error técnico, no «anónimo».
 *
 * Solo lecturas (listar/reabrir) con el cliente de sesión y RLS. A propósito NO
 * recibe `executor`: ese canal de mínimo privilegio es para escrituras de
 * agentes y auditoría, y se compone en `lib/documents/runtime.ts`.
 */
export async function documentServiceForRequest() {
  const check = await verifiedRequestSession();
  if (check.status === "unavailable") throw new SessionUnavailableError();
  if (check.status === "anonymous") redirect(LOGIN_PATH);
  const userId = check.user.id;
  const client = await getSessionClient();
  return createDocumentService({ currentUserId: async () => userId }, createDocumentStore({ verifiedUserId: userId, session: client }));
}
