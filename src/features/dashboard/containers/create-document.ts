"use client";

import { z } from "zod";

import { DocumentSummarySchema } from "@/lib/contracts/document";

/**
 * Creación de documento con el endpoint real `POST /api/documents`, compartida
 * por el panel y la guía de activación. La clave de idempotencia la conserva
 * quien llama entre reintentos de la misma creación.
 */

export const NEW_DOCUMENT_TITLE = "Documento sin título";

const CreateResponseSchema = z.object({ result: DocumentSummarySchema });

export type CreateDocumentResult = { status: "created"; id: string } | { status: "unauthenticated" } | { status: "error" };

export async function createDocument(idempotencyKey: string): Promise<CreateDocumentResult> {
  try {
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ title: NEW_DOCUMENT_TITLE, idempotencyKey }),
    });
    if (response.status === 401) return { status: "unauthenticated" };
    const parsed = CreateResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) return { status: "error" };
    return { status: "created", id: parsed.data.result.id };
  } catch {
    return { status: "error" };
  }
}
