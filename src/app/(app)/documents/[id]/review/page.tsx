import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ReviewContainer, type Frozen } from "@/features/corroborations/containers/review-container";
import { failureKind } from "@/features/documents/containers/failure-kind";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";
import { LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../../../_lib/documents";

/**
 * Revisión del autor (MVP-077/078). Ajeno e inexistente responden igual (404).
 * El `draftRevision` vigente sale del mismo lector que usa el congelado en el
 * servidor; el cliente solo lo devuelve como `expectedDraftRevision` y el
 * servidor revalida. Si ya hay una revisión vigente se muestra esa (recarga sin
 * reemitir enlaces). Sin borrador aún no hay nada que congelar.
 */
export default async function DocumentReviewPage({ params }: PageProps<"/documents/[id]/review">) {
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

  const context = await reviewHttpDeps.getContext();
  if (context.session.status === "anonymous") redirect(LOGIN_PATH);
  if (context.session.status === "unavailable") throw new Error("No se pudo verificar la sesión.");
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: context.session.user.id, session: context.rpc });
  const hcsStatus = result.value.hcsStatus;
  // Revisión vigente: se hidrata tal cual está congelada (sin congelar ni emitir enlaces al cargar).
  const bundle = await store.getActiveRevision(context.session.user.id, id);
  const source = bundle ? null : await reader.getFreezeSource(context.session.user.id, id);
  const active: Frozen | null = bundle
    ? {
        revisionId: bundle.revision.revisionId,
        snapshotId: bundle.snapshot.snapshotId,
        snapshotHash: bundle.snapshot.snapshotHash,
        selection: bundle.revision.selection,
        snapshot: {
          status: "ready",
          revisionId: bundle.revision.revisionId,
          snapshotId: bundle.snapshot.snapshotId,
          content: bundle.snapshot.content,
          documentStatus: bundle.revision.documentStatus,
          controlStatus: bundle.revision.controlStatus,
          confirmationStatus: bundle.revision.confirmationStatus,
          hcsStatus,
        },
      }
    : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Revisión de «{result.value.title}»</h1>
      {bundle || source ? (
        <ReviewContainer documentId={id} draftRevision={bundle ? bundle.revision.frozenFromDraftRevision : source!.draft.draftRevision} hcsStatus={hcsStatus} active={active} />
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay un borrador para revisar. Conversá en el documento y volvé cuando esté listo.</p>
      )}
    </main>
  );
}
