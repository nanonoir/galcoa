"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  FinalizationPanel,
  type FinalizationPanelState,
  type FinalizationPhase,
  type FinalizationSealInfo,
} from "@/features/corroborations/components/finalization-panel";

/**
 * Container de «Subir Contrato» (MVP-082). `POST` reclama/reanuda en el servidor, avanza las fases
 * y, ya publicada la versión, espera el sello en Hedera; `GET` solo lee. Sin éxito optimista: el
 * estado sale de la respuesta. Dos sondeos acotados (intervalo fijo y tope de intentos, solo con la
 * pestaña visible): `GET` mientras las fases avanzan y `POST` idempotente (reconcilia sin reenviar)
 * mientras el sello sigue pendiente. Ambos terminan en `stalled`, desde donde el usuario decide
 * actualizar o reintentar. Al registrarse el sello se refresca el render del servidor.
 */

export const FINALIZATION_POLL_MS = 3_000;
export const FINALIZATION_POLL_MAX_ATTEMPTS = 20;
export const SEAL_RETRY_MS = 4_000;
export const SEAL_RETRY_MAX_ATTEMPTS = 10;

export interface FinalizationContainerProps {
  documentId: string;
  revisionId: string;
  onPublished?: (versionNumber: number) => void;
}

interface Operation {
  phase: FinalizationPhase;
  versionNumber: number | null;
}

type Outcome = "working" | "sealing" | "done";

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, body };
}

function errorCode(body: Record<string, unknown> | null) {
  return (body?.error as { code?: string } | undefined)?.code ?? "TECHNICAL_FAILURE";
}

function parseSeal(body: Record<string, unknown> | null): FinalizationSealInfo | null {
  const seal = body?.seal as ({ status?: string } & Partial<FinalizationSealInfo>) | undefined;
  if (seal?.status !== "registrado") return null;
  const { reference, topicId, sequenceNumber, transactionId, consensusTimestamp } = seal;
  if (!reference || !topicId || !sequenceNumber || !transactionId || !consensusTimestamp) return null;
  return { reference, topicId, sequenceNumber, transactionId, consensusTimestamp };
}

export function FinalizationContainer({ documentId, revisionId, onPublished }: FinalizationContainerProps) {
  const router = useRouter();
  const [state, setState] = useState<FinalizationPanelState>({ status: "idle" });
  const [polling, setPolling] = useState(0);
  const [sealing, setSealing] = useState(0);
  const phase = useRef<FinalizationPhase | null>(null);
  const publishedVersion = useRef<number | null>(null);
  const onPublishedRef = useRef(onPublished);
  const routerRef = useRef(router);
  useEffect(() => {
    onPublishedRef.current = onPublished;
    routerRef.current = router;
  });

  const url = `/api/documents/${encodeURIComponent(documentId)}/revisions/${encodeURIComponent(revisionId)}/finalization`;

  function apply(operation: Operation, seal: FinalizationSealInfo | null): Outcome {
    phase.current = operation.phase;
    if (operation.phase === "published" && operation.versionNumber !== null) {
      publishedVersion.current = operation.versionNumber;
      if (!seal) {
        setState({ status: "sealing", versionNumber: operation.versionNumber, documentId });
        return "sealing";
      }
      setState({ status: "published", versionNumber: operation.versionNumber, seal, documentId });
      onPublishedRef.current?.(operation.versionNumber);
      // El estado HCS de ReviewProgress viene del render del servidor.
      routerRef.current.refresh();
      return "done";
    }
    setState({ status: "in_progress", phase: operation.phase });
    return "working";
  }

  function continueFrom(outcome: Outcome) {
    if (outcome === "working") setPolling((n) => n + 1);
    else if (outcome === "sealing") setSealing((n) => n + 1);
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
      continueFrom(apply(operation, parseSeal(result.body)));
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
      else continueFrom(apply(operation, null));
    } catch {
      setState({ status: "failed", code: "TECHNICAL_FAILURE" });
    }
  }

  // Sondeo del GET mientras avanzan las fases.
  useEffect(() => {
    if (polling === 0) return;
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const stall = () =>
      setState({ status: "stalled", phase: phase.current, ...(publishedVersion.current !== null && { versionNumber: publishedVersion.current, documentId }) });
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      if (document.visibilityState === "visible") {
        try {
          const operation = await readStatus();
          if (cancelled) return;
          if (operation) {
            const outcome = apply(operation, null);
            if (outcome !== "working") {
              continueFrom(outcome);
              return;
            }
          }
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

  // Reintento del POST (idempotente) mientras el sello sigue pendiente.
  useEffect(() => {
    if (sealing === 0) return;
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      if (document.visibilityState === "visible") {
        try {
          const result = await call(url, { method: "POST" });
          if (cancelled) return;
          const operation = (result.body as { operation?: Operation } | null)?.operation;
          if (result.ok && operation && apply(operation, parseSeal(result.body)) === "done") return;
        } catch {
          // Fallo transitorio: cuenta como intento y sigue dentro del tope.
        }
      }
      if (cancelled) return;
      if (attempts >= SEAL_RETRY_MAX_ATTEMPTS) {
        setState({ status: "stalled", phase: "published", ...(publishedVersion.current !== null && { versionNumber: publishedVersion.current, documentId }) });
      }
      else timer = setTimeout(() => void tick(), SEAL_RETRY_MS);
    };
    timer = setTimeout(() => void tick(), SEAL_RETRY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealing]);

  return <FinalizationPanel state={state} onFinalize={() => void finalize()} onRefresh={() => void refresh()} />;
}
