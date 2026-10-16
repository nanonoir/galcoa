"use client";

import { useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ParticipantSelector } from "@/features/corroborations/components/participant-selector";
import { ReviewProgress, type ParticipantProgress } from "@/features/corroborations/components/review-progress";
import { ShareLinksPanel, type ShareLinkItem } from "@/features/corroborations/components/share-links-panel";
import { buildMailtoUrl, buildWhatsAppUrl } from "@/features/corroborations/lib/share-links";
import { SnapshotView } from "@/features/documents/components/snapshot-view";
import type { ConfirmationStatus } from "@/lib/contracts/document";
import type { ParticipantSelection, ThirdPartyRole } from "@/lib/contracts/review";
import type { SnapshotViewState } from "@/lib/contracts/snapshot-view";

/**
 * Container de la revisión del autor (MVP-077/078). Usa los endpoints reales del
 * propietario: congelar, emitir enlace por tercero, confirmar como autor y leer el
 * avance. Sin éxito optimista: cada resultado sale de la respuesta del servidor; un
 * fallo se muestra como error. La clave de idempotencia se conserva entre reintentos
 * de la misma intención y se renueva solo tras un éxito. Los enlaces en claro viven
 * solo en memoria de esta pantalla (el servidor guarda únicamente el hash).
 */

interface Frozen {
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  selection: ParticipantSelection;
  snapshot: Extract<SnapshotViewState, { status: "ready" }>;
}

interface Progress {
  confirmationStatus: ConfirmationStatus;
  missingRoles: string[];
  authorConfirmed: boolean;
}

export interface ReviewContainerProps {
  documentId: string;
  draftRevision: number;
}

const ERRORS: Record<string, string> = {
  STALE_DRAFT: "El borrador cambió mientras elegías. Volvé a cargar la página y reintentá.",
  NO_SESSION: "Tu sesión venció. Volvé a ingresar.",
  REVISION_NOT_ACTIVE: "Esta revisión ya no está vigente. Abrí una nueva revisión.",
};

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, body };
}

function errorText(body: Record<string, unknown> | null, fallback: string) {
  const code = (body?.error as { code?: string } | undefined)?.code;
  return (code && ERRORS[code]) || fallback;
}

export function ReviewContainer({ documentId, draftRevision }: ReviewContainerProps) {
  const [selection, setSelection] = useState<ParticipantSelection>(["autor"]);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [links, setLinks] = useState<ShareLinkItem[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});

  const key = (intent: string) => (keys.current[intent] ??= crypto.randomUUID());
  const renew = (intent: string) => delete keys.current[intent];

  function toLink(role: ThirdPartyRole, token: string | null): ShareLinkItem {
    const url = token ? `${window.location.origin}/confirm/${encodeURIComponent(token)}` : null;
    return { role, url, whatsappUrl: url && buildWhatsAppUrl(url), mailtoUrl: url && buildMailtoUrl(url) };
  }

  async function issue(revisionId: string, role: ThirdPartyRole) {
    const result = await call(`/api/revisions/${encodeURIComponent(revisionId)}/invitations`, {
      method: "POST",
      body: JSON.stringify({ role, idempotencyKey: key(`issue-${revisionId}-${role}`) }),
    });
    const token = (result.body as { token?: string } | null)?.token;
    if (!result.ok || !token) throw new Error(errorText(result.body, "No se pudo generar el enlace."));
    renew(`issue-${revisionId}-${role}`);
    return token;
  }

  async function refresh(revisionId: string) {
    setRefreshing(true);
    try {
      const result = await call(`/api/revisions/${encodeURIComponent(revisionId)}/confirmations`);
      const agg = result.body as { confirmationStatus?: ConfirmationStatus; missingRoles?: string[] } | null;
      if (!result.ok || !agg?.confirmationStatus) throw new Error("No se pudo actualizar el avance.");
      setProgress((prev) => ({ confirmationStatus: agg.confirmationStatus!, missingRoles: agg.missingRoles ?? [], authorConfirmed: prev?.authorConfirmed ?? !(agg.missingRoles ?? []).includes("autor") }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el avance.");
    } finally {
      setRefreshing(false);
    }
  }

  async function freeze() {
    setBusy(true);
    setError(null);
    try {
      const roles = selection.filter((r) => r !== "autor");
      const result = await call(`/api/documents/${encodeURIComponent(documentId)}/revisions`, {
        method: "POST",
        body: JSON.stringify({ expectedDraftRevision: draftRevision, selection: roles, idempotencyKey: key("freeze") }),
      });
      const data = result.body as { revision?: Record<string, string>; snapshot?: Record<string, unknown> } | null;
      if (!result.ok || !data?.revision || !data.snapshot) throw new Error(errorText(result.body, "No se pudo congelar la revisión."));
      renew("freeze");
      const next: Frozen = {
        revisionId: String(data.revision.revisionId),
        snapshotId: String(data.snapshot.snapshotId),
        snapshotHash: String(data.snapshot.snapshotHash),
        selection,
        snapshot: {
          status: "ready",
          revisionId: String(data.revision.revisionId),
          snapshotId: String(data.snapshot.snapshotId),
          content: data.snapshot.content as Extract<SnapshotViewState, { status: "ready" }>["content"],
          documentStatus: data.revision.documentStatus as never,
          controlStatus: data.revision.controlStatus as never,
          confirmationStatus: data.revision.confirmationStatus as never,
          hcsStatus: "no_iniciado",
        },
      };
      setFrozen(next);
      const thirds = roles as ThirdPartyRole[];
      const issued: ShareLinkItem[] = [];
      for (const role of thirds) issued.push(toLink(role, await issue(next.revisionId, role)));
      setLinks(issued);
      setProgress({ confirmationStatus: "pendiente", missingRoles: selection, authorConfirmed: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo congelar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  async function reissue(role: ThirdPartyRole) {
    if (!frozen) return;
    setError(null);
    try {
      const token = await issue(frozen.revisionId, role);
      setLinks((prev) => prev.map((l) => (l.role === role ? toLink(role, token) : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el enlace.");
    }
  }

  async function confirmAsAuthor() {
    if (!frozen) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call(`/api/documents/${encodeURIComponent(documentId)}/revisions/confirm`, {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          revisionId: frozen.revisionId,
          snapshotId: frozen.snapshotId,
          snapshotHash: frozen.snapshotHash,
          idempotencyKey: key("confirm"),
          decision: "confirmar",
          checkboxChecked: true,
        }),
      });
      if (!result.ok) throw new Error(errorText(result.body, "No se pudo registrar tu confirmación."));
      renew("confirm");
      setProgress((prev) => (prev ? { ...prev, authorConfirmed: true } : prev));
      await refresh(frozen.revisionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar tu confirmación.");
    } finally {
      setBusy(false);
    }
  }

  const participants = frozen
    ? frozen.selection.map((role) => ({
        role,
        progress: (progress?.missingRoles.includes(role) ? "pendiente" : "confirmada") as ParticipantProgress,
      }))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Algo no salió bien</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ParticipantSelector value={frozen?.selection ?? selection} locked={frozen !== null} onChange={setSelection} />

      {frozen === null ? (
        <Button type="button" onClick={() => void freeze()} disabled={busy} className="self-start">
          {busy ? "Congelando…" : "Congelar y generar enlaces"}
        </Button>
      ) : (
        <>
          <SnapshotView state={frozen.snapshot} onRetry={() => void refresh(frozen.revisionId)} />

          <section aria-labelledby="author-confirm-title" className="flex flex-col gap-3">
            <h2 id="author-confirm-title" className="text-lg font-semibold">
              Tu confirmación
            </h2>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={progress?.authorConfirmed} className="size-4" />
              Revisé la operación y las advertencias, y confirmo esta versión.
            </label>
            <Button type="button" onClick={() => void confirmAsAuthor()} disabled={!agreed || busy || progress?.authorConfirmed} className="self-start">
              {progress?.authorConfirmed ? "Ya confirmaste" : "Confirmar como autor"}
            </Button>
          </section>

          {progress && (
            <ReviewProgress
              revisionLabel="Revisión actual"
              confirmationStatus={progress.confirmationStatus}
              participants={participants}
              finalizedVersionNumber={null}
              hcsStatus="no_iniciado"
              refreshing={refreshing}
              onRefresh={() => void refresh(frozen.revisionId)}
            />
          )}

          <ShareLinksPanel links={links} onCopy={(url) => navigator.clipboard.writeText(url)} onReissue={(role) => void reissue(role)} />
        </>
      )}
    </div>
  );
}
