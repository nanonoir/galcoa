"use client";

import { useEffect, useRef, useState } from "react";

import { FinalizationPanel, type FinalizationPanelState, type FinalizationPhase } from "@/features/corroborations/components/finalization-panel";

/**
 * Container de la finalización (MVP-082). `POST` reclama/reanuda en el servidor y devuelve la
 * fase; `GET` solo lee. Sin éxito optimista: el estado sale de la respuesta. El sondeo es
 * acotado (intervalo fijo y tope de intentos, solo con la pestaña visible) y termina en
 * `stalled`, desde donde el usuario decide actualizar o reanudar. Descarga del PDF e historial
 * dependen de una lectura de versiones publicadas que aún no existe como ruta: no se simula.
 */

export const FINALIZATION_POLL_MS = 3_000;
export const FINALIZATION_POLL_MAX_ATTEMPTS = 20;

export interface FinalizationContainerProps {
  documentId: string;
  revisionId: string;
  onPublished?: (versionNumber: number) => void;
}

interface Operation {
  phase: FinalizationPhase;
  versionNumber: number | null;
}

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, body };
}

function errorCode(body: Record<string, unknown> | null) {
  return (body?.error as { code?: string } | undefined)?.code ?? "TECHNICAL_FAILURE";
}

export function FinalizationContainer({ documentId, revisionId, onPublished }: FinalizationContainerProps) {
  const [state, setState] = useState<FinalizationPanelState>({ status: "idle" });
  const [polling, setPolling] = useState(0);
  const phase = useRef<FinalizationPhase | null>(null);
  const onPublishedRef = useRef(onPublished);
  useEffect(() => {
    onPublishedRef.current = onPublished;
  });

  const url = `/api/documents/${encodeURIComponent(documentId)}/revisions/${encodeURIComponent(revisionId)}/finalization`;

  function apply(operation: Operation) {
    phase.current = operation.phase;
    if (operation.phase === "published" && operation.versionNumber !== null) {
      setState({ status: "published", versionNumber: operation.versionNumber });
      onPublishedRef.current?.(operation.versionNumber);
      return true;
    }
    setState({ status: "in_progress", phase: operation.phase });
    return false;
  }

  async function finalize() {
    setState({ status: "starting" });
    try {
      const result = await call(url, { method: "POST" });
      const operation = (result.body as { operation?: Operation } | null)?.operation;
      if (!result.ok || !operation) {
        setState({ status: "failed", code: errorCode(result.body) });
        return;
      }
      if (!apply(operation)) setPolling((n) => n + 1);
    } catch {
      setState({ status: "failed", code: "TECHNICAL_FAILURE" });
    }
  }

  async function readStatus() {
    const result = await call(url);
    const operation = (result.body as { operation?: Operation } | null)?.operation;
    if (!result.ok || !operation) return null;
    return operation;
  }

  async function refresh() {
    try {
      const operation = await readStatus();
      if (!operation) setState({ status: "failed", code: "TECHNICAL_FAILURE" });
      else if (!apply(operation)) setPolling((n) => n + 1);
    } catch {
      setState({ status: "failed", code: "TECHNICAL_FAILURE" });
    }
  }

  useEffect(() => {
    if (polling === 0) return;
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const stall = () => setState({ status: "stalled", phase: phase.current });
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      if (document.visibilityState === "visible") {
        try {
          const operation = await readStatus();
          if (cancelled) return;
          if (operation && apply(operation)) return;
        } catch {
          // Fallo transitorio: cuenta como intento y sigue dentro del tope.
        }
      }
      if (cancelled) return;
      if (attempts >= FINALIZATION_POLL_MAX_ATTEMPTS) stall();
      else timer = setTimeout(() => void tick(), FINALIZATION_POLL_MS);
    };
    timer = setTimeout(() => void tick(), FINALIZATION_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  return <FinalizationPanel state={state} onFinalize={() => void finalize()} onRefresh={() => void refresh()} />;
}
