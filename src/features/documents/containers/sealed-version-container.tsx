"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SealedVersionCard } from "@/features/documents/components/sealed-version-card";
import type { SealedVersionView } from "@/lib/contracts/sealed-version-view";

/**
 * Tarjeta persistente de la versión publicada (fuente: servidor). Si el sello no está registrado,
 * «Reintentar registro» hace `POST` al endpoint de finalización de esa revisión (idempotente:
 * reconcilia sin reenviar lo ya registrado) y refresca el render del servidor. Sin éxito optimista.
 */

export function SealedVersionContainer({ version }: { version: SealedVersionView }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  async function retry() {
    setRetrying(true);
    setRetryFailed(false);
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(version.documentId)}/revisions/${encodeURIComponent(version.revisionId)}/finalization`,
        { method: "POST", credentials: "same-origin" },
      );
      if (!response.ok) setRetryFailed(true);
      router.refresh();
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  }

  return <SealedVersionCard version={version} onCopy={(value) => navigator.clipboard.writeText(value)} onRetry={() => void retry()} retrying={retrying} retryFailed={retryFailed} />;
}
