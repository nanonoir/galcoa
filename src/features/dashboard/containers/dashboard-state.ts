import { DashboardViewStateSchema, type DashboardViewState } from "@/lib/contracts/dashboard";
import type { DocumentSummary } from "@/lib/contracts/document";

/** Forma mínima del resultado del servicio de listado (MVP-040); evita importar código de servidor. */
export type ListDocumentsResult = { ok: true; value: DocumentSummary[] } | { ok: false; error: { retryable: boolean } };

export const DASHBOARD_LOAD_ERROR = "No se pudieron cargar tus documentos. Intenta nuevamente.";

/**
 * Proyección del resultado del servicio al estado de vista, validada con el
 * contrato. Un fallo técnico es `error`, nunca una lista vacía; si el DTO no
 * cumple el contrato también es `error` (no se muestra un estado inventado).
 */
export function toDashboardState(result: ListDocumentsResult): DashboardViewState {
  if (!result.ok) return { status: "error", message: DASHBOARD_LOAD_ERROR };
  const parsed = DashboardViewStateSchema.safeParse({ status: "ready", documents: result.value });
  return parsed.success ? parsed.data : { status: "error", message: DASHBOARD_LOAD_ERROR };
}
