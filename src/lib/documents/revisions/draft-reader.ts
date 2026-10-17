import "server-only";

import { z } from "zod";

import { DraftSchema, type Draft } from "@/lib/contracts/core";

import type { DocumentRpc } from "../persistence/store";

/**
 * Lectura del borrador vigente del propietario (fuente de `readDraft` del contraste y de la
 * revisión esperada del turno). Usa `get_freeze_source` con la sesión verificada: la base
 * decide propiedad por `auth.uid()`. Solo se valida `draft`; los reportes de esa fuente son de
 * la lectura congelada y un reporte corrupto no debe impedir chatear ni contrastar.
 */

const Source = z.looseObject({ draft: DraftSchema });

export function createDraftReader(context: { verifiedUserId: string; session: DocumentRpc }) {
  return async function readDraft(ownerId: string, documentId: string): Promise<Draft | null> {
    if (!ownerId || ownerId !== context.verifiedUserId) throw new Error("Operación no autorizada");
    const { data, error } = await context.session.rpc("get_freeze_source", { p_document_id: documentId });
    if (error) throw new Error("Persistencia no disponible");
    if (data === null) return null;
    const parsed = Source.safeParse(data);
    if (!parsed.success || parsed.data.draft.documentId !== documentId) throw new Error("Respuesta de persistencia inválida");
    return parsed.data.draft;
  };
}
