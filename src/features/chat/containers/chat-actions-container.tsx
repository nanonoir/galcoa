"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ChatActionsBar } from "@/features/chat/components/chat-actions-bar";
import { FinalizationContainer } from "@/features/corroborations/containers/finalization-container";

/**
 * Acciones del borrador publicado (demo, D2). «Confirmar» congela la revisión con el autor como
 * único participante (`POST …/revisions`), registra su confirmación (`POST …/revisions/confirm`)
 * y lee el avance; solo con `completa` aparece «Subir Contrato». Sin éxito optimista: cada paso
 * sale de la respuesta del servidor. Las claves de idempotencia se conservan entre reintentos de
 * la misma intención y se renuevan tras un éxito. Si la revisión vigente ya tenía la confirmación
 * del autor, se omite el paso de confirmar (la base devuelve `unchanged` al congelar).
 */

const ERRORS: Record<string, string> = {
  NO_SESSION: "Tu sesión venció. Volvé a ingresar.",
  STALE_DRAFT: "El borrador cambió mientras confirmabas. Reintentá.",
  REVISION_NOT_ACTIVE: "Esta revisión ya no está vigente. Reintentá.",
  DOCUMENT_FINALIZED: "El documento ya está finalizado.",
  NO_DRAFT: "Todavía no hay un borrador para confirmar.",
};

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, body };
}

function failure(body: Record<string, unknown> | null, fallback: string) {
  const code = (body?.error as { code?: string } | undefined)?.code;
  return new Error((code && ERRORS[code]) || fallback);
}

export function ChatActionsContainer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});

  const key = (intent: string) => (keys.current[intent] ??= crypto.randomUUID());
  const renew = (intent: string) => delete keys.current[intent];
  const base = `/api/documents/${encodeURIComponent(documentId)}`;

  async function confirm(): Promise<boolean> {
    setError(null);
    try {
      // Revisión del borrador vigente según el servidor: evita congelar un valor viejo del cliente.
      const draft = await call(`${base}/draft`);
      const draftRevision = (draft.body as { draftRevision?: number } | null)?.draftRevision;
      if (!draft.ok || typeof draftRevision !== "number") throw failure(draft.body, "No se pudo leer el borrador.");

      const freezeIntent = `freeze-${draftRevision}`;
      const frozen = await call(`${base}/revisions`, {
        method: "POST",
        body: JSON.stringify({ expectedDraftRevision: draftRevision, selection: [], idempotencyKey: key(freezeIntent) }),
      });
      const data = frozen.body as { revision?: Record<string, string>; snapshot?: Record<string, string> } | null;
      if (!frozen.ok || !data?.revision || !data.snapshot) throw failure(frozen.body, "No se pudo congelar la revisión.");
      renew(freezeIntent);
      const revision = String(data.revision.revisionId);

      const aggregateUrl = `/api/revisions/${encodeURIComponent(revision)}/confirmations`;
      const readAggregate = async () => {
        const result = await call(aggregateUrl);
        const aggregate = result.body as { confirmationStatus?: string; missingRoles?: string[] } | null;
        if (!result.ok || !aggregate?.confirmationStatus) throw new Error("No se pudo leer el estado de la confirmación.");
        return aggregate;
      };

      let aggregate = await readAggregate();
      if (aggregate.missingRoles?.includes("autor")) {
        const confirmIntent = `confirm-${revision}`;
        const confirmed = await call(`${base}/revisions/confirm`, {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: 1,
            revisionId: revision,
            snapshotId: String(data.snapshot.snapshotId),
            snapshotHash: String(data.snapshot.snapshotHash),
            idempotencyKey: key(confirmIntent),
            decision: "confirmar",
            checkboxChecked: true,
          }),
        });
        if (!confirmed.ok) throw failure(confirmed.body, "No se pudo registrar tu confirmación.");
        renew(confirmIntent);
        aggregate = await readAggregate();
      }
      if (aggregate.confirmationStatus !== "completa") throw new Error("La confirmación todavía no quedó completa. Reintentá.");
      setRevisionId(revision);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo confirmar.");
      return false;
    }
  }

  return (
    <ChatActionsBar
      previewUrl={`${base}/preview`}
      onShare={() => router.push(`/documents/${encodeURIComponent(documentId)}/review`)}
      onConfirm={confirm}
      confirmed={revisionId !== null}
      error={error}
    >
      {revisionId ? <FinalizationContainer key={revisionId} documentId={documentId} revisionId={revisionId} /> : null}
    </ChatActionsBar>
  );
}
