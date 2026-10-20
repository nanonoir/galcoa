import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ChatContainer } from "@/features/chat/containers/chat-container";
import { DocumentTitleEditor } from "@/features/documents/containers/document-title-editor";
import { DocumentHistoryContainer } from "@/features/documents/containers/document-history-container";
import { failureKind } from "@/features/documents/containers/failure-kind";
import { SealedVersionContainer } from "@/features/documents/containers/sealed-version-container";
import { LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../../_lib/documents";
import { sealedVersionForRequest } from "../../_lib/sealed-version";
import { versionHistoryForRequest } from "../../_lib/version-history";

/**
 * Documento del propietario (MVP-116/I3). Ajeno e inexistente responden igual
 * (404). El historial sale de las versiones finalizadas reales (sesión + RLS);
 * un fallo de lectura se muestra como error, no como lista vacía. El chat
 * (MVP-054) consume las rutas reales de chat y contraste.
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

  const finalized = result.value.documentStatus === "finalizado";
  // Fuente persistente: la tarjeta aparece en el mismo render en que el chat deja de ofrecer acciones.
  const sealed = finalized ? await sealedVersionForRequest(id) : null;
  const history = await versionHistoryForRequest(id);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <p className="eyebrow self-start">Documento</p>
      <DocumentTitleEditor documentId={id} title={result.value.title} />
      {sealed && <SealedVersionContainer version={sealed} />}
      <ChatContainer documentId={id} finalized={finalized} />
      <DocumentHistoryContainer documentId={id} state={history} />
    </main>
  );
}
