"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { z } from "zod";

import { DashboardReference } from "@/features/dashboard/components/dashboard-reference";
import type { DashboardViewState } from "@/lib/contracts/dashboard";
import { DocumentSummarySchema } from "@/lib/contracts/document";

/**
 * Container del dashboard (MVP-116/I2). Crea y reabre documentos con los
 * endpoints reales de `/api/documents`; un fallo se muestra como `error`, nunca
 * como éxito simulado. La clave de idempotencia se conserva entre reintentos de
 * la misma creación y se renueva solo tras un éxito.
 */

export const NEW_DOCUMENT_TITLE = "Documento sin título";
/** Igual que `LOGIN_PATH` de Auth (módulo de servidor, no importable desde el cliente). */
const LOGIN_PATH = "/acceso";
const CREATE_ERROR = "No se pudo crear el documento. Intenta nuevamente.";

const CreateResponseSchema = z.object({ result: DocumentSummarySchema });

export function DashboardContainer({ initialState }: { initialState: DashboardViewState }) {
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
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title: NEW_DOCUMENT_TITLE, idempotencyKey: idempotencyKey.current }),
      });
      if (response.status === 401) {
        // Sesión vencida: se vuelve al acceso en vez de mostrar un error genérico.
        router.replace(LOGIN_PATH);
        return;
      }
      const parsed = CreateResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error("create failed");
      idempotencyKey.current = null;
      router.push(`/documents/${encodeURIComponent(parsed.data.result.id)}`);
    } catch {
      setActionError(CREATE_ERROR);
      setCreating(false);
    }
  }

  return (
    <DashboardReference
      state={state}
      onCreate={() => void create()}
      onOpen={(documentId) => router.push(`/documents/${encodeURIComponent(documentId)}`)}
      onRetry={() => {
        setActionError(null);
        router.refresh();
      }}
    />
  );
}
