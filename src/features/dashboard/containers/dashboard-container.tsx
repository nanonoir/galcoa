"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { DashboardReference } from "@/features/dashboard/components/dashboard-reference";
import type { DashboardViewState } from "@/lib/contracts/dashboard";

import { createDocument, NEW_DOCUMENT_TITLE } from "./create-document";

/**
 * Container del dashboard (MVP-116/I2). Crea y reabre documentos con los
 * endpoints reales de `/api/documents`; un fallo se muestra como `error`, nunca
 * como éxito simulado. La clave de idempotencia se conserva entre reintentos de
 * la misma creación y se renueva solo tras un éxito.
 */

export { NEW_DOCUMENT_TITLE };
/** Igual que `LOGIN_PATH` de Auth (módulo de servidor, no importable desde el cliente). */
const LOGIN_PATH = "/acceso";
const CREATE_ERROR = "No se pudo crear el documento. Intenta nuevamente.";

export function DashboardContainer({ initialState, guideShown = false }: { initialState: DashboardViewState; guideShown?: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const state: DashboardViewState = creating
    ? { status: "loading" }
    : actionError
      ? { status: "error", message: actionError }
      : initialState;

  async function create() {
    idempotencyKey.current ??= crypto.randomUUID();
    setCreating(true);
    setActionError(null);
    const result = await createDocument(idempotencyKey.current);
    if (result.status === "unauthenticated") {
      // Sesión vencida: se vuelve al acceso en vez de mostrar un error genérico.
      router.replace(LOGIN_PATH);
      return;
    }
    if (result.status === "error") {
      setActionError(CREATE_ERROR);
      setCreating(false);
      return;
    }
    idempotencyKey.current = null;
    router.push(`/documents/${encodeURIComponent(result.id)}`);
  }

  return (
    <DashboardReference
      state={state}
      guideShown={guideShown}
      onCreate={() => void create()}
      onOpen={(documentId) => router.push(`/documents/${encodeURIComponent(documentId)}`)}
      onRetry={() => {
        setActionError(null);
        router.refresh();
      }}
    />
  );
}
