import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ChatContainer } from "@/features/chat/containers/chat-container";
import { DocumentHistoryContainer } from "@/features/documents/containers/document-history-container";
import { failureKind } from "@/features/documents/containers/failure-kind";
import type { VersionHistoryViewState } from "@/lib/contracts/version-history-view";
import { LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../../_lib/documents";

/**
 * Documento del propietario (MVP-116/I3). Ajeno e inexistente responden igual
 * (404). Aún no hay servicio de versiones (MVP-083/084): el historial se
 * entrega vacío, sin rellenar con fixtures. El chat (MVP-054) consume las rutas
 * reales de chat y contraste.
 */
export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const documents = await documentServiceForRequest();
  const result = await documents.getDocument(id);
  if (!result.ok) {
    const kind = failureKind(result.error);
    if (kind === "not_found") notFound();
    if (kind === "unauthenticated") redirect(LOGIN_PATH);
    throw new Error("No se pudo cargar el documento.");
  }

  const history: VersionHistoryViewState = { status: "ready", versions: [] };
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{result.value.title}</h1>
      <Link href={`/documents/${id}/review`} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
        Revisar y compartir con los participantes
      </Link>
      <ChatContainer documentId={id} />
      <DocumentHistoryContainer state={history} />
    </main>
  );
}
