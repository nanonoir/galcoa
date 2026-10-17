import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ReviewContainer, type Frozen } from "@/features/corroborations/containers/review-container";
import { failureKind } from "@/features/documents/containers/failure-kind";
import { createExecutorRpc } from "@/lib/documents/persistence/executor-rpc";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";
import { LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../../../_lib/documents";

/**
 * Revisión del autor (MVP-077/078). Ajeno e inexistente responden igual (404).
 * El `draftRevision` vigente sale del mismo lector que usa el congelado en el
 * servidor; el cliente solo lo devuelve como `expectedDraftRevision` y el
 * servidor revalida. Si ya hay una revisión vigente se muestra esa (recarga sin
 * reemitir enlaces) junto con el borrador actual, para ofrecer reabrirla. Sin borrador aún no hay nada que congelar.
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
  const { store, reader } = createSupabaseRevisionAdapters({
    verifiedUserId: context.session.user.id,
    session: context.rpc,
    executor: createExecutorRpc(context.session.user.id),
  });
  const hcsStatus = result.value.hcsStatus;
  const bundle = await store.getActiveRevision(context.session.user.id, id);
  // Con revisión vigente también se lee el borrador actual: así se detecta si cambió desde el congelado.
  // Si esa lectura falla, la revisión vigente se sigue mostrando y el servidor revalida al congelar.
  const source = bundle
    ? await reader.getFreezeSource(context.session.user.id, id).catch(() => null)
    : await reader.getFreezeSource(context.session.user.id, id);
  const active: Frozen | null = bundle
    ? {
        revisionId: bundle.revision.revisionId,
        frozenFromDraftRevision: bundle.revision.frozenFromDraftRevision,
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <p className="eyebrow self-start">Revisión y confirmaciones</p>
      <h1 className="page-title">Revisión de «{result.value.title}»</h1>
      {bundle || source ? (
        <ReviewContainer documentId={id} draftRevision={source ? source.draft.draftRevision : bundle!.revision.frozenFromDraftRevision} hcsStatus={hcsStatus} active={active} documentFinalized={result.value.documentStatus === "finalizado"} />
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay un borrador para revisar. Conversá en el documento y volvé cuando esté listo.</p>
      )}
    </main>
  );
}
