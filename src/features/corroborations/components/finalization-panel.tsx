import { ArrowUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FinalPdfDownloadLink, SealRegisteredAlert } from "@/features/documents/components/sealed-version-card";

/**
 * Finalización de la revisión (REQ-12, INV-13/14): presentación pura. Recibe el estado ya
 * resuelto por el container; no consulta red. Las advertencias del contenido no bloquean:
 * solo bloquean las confirmaciones faltantes o un rechazo, y eso lo decide el servidor.
 */

export type FinalizationPhase = "reserved" | "pdf_staged" | "manifest_ready" | "object_checked" | "published";

/** Identificadores públicos y opacos del sello registrado en Hedera Testnet (INV-06). */
export interface FinalizationSealInfo {
  reference: string;
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
  consensusTimestamp: string;
}

export type FinalizationPanelState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "in_progress"; phase: FinalizationPhase }
  /** Versión publicada; la huella todavía no quedó registrada en Hedera. */
  | { status: "sealing"; versionNumber: number; documentId?: string }
  /** El sondeo agotó su tope: la operación puede seguir avanzando en el servidor. */
  | { status: "stalled"; phase: FinalizationPhase | null; versionNumber?: number; documentId?: string }
  | { status: "published"; versionNumber: number; seal: FinalizationSealInfo; documentId?: string }
  | { status: "failed"; code: string };

export interface FinalizationPanelProps {
  state: FinalizationPanelState;
  onFinalize: () => void;
  onRefresh: () => void;
}

export const phaseLabels: Record<FinalizationPhase, string> = {
  reserved: "Operación reservada",
  pdf_staged: "PDF preparado",
  manifest_ready: "Manifiesto listo",
  object_checked: "Archivo verificado",
  published: "Versión publicada",
};

export const errorTexts: Record<string, string> = {
  CONFIRMATION_REJECTED: "Un participante rechazó esta revisión: no se puede finalizar. Abrí otra revisión para continuar.",
  CONFIRMATIONS_MISSING: "Todavía faltan confirmaciones de los participantes seleccionados.",
  DRAFT_CHANGED: "El borrador cambió después de congelar esta revisión. Abrí una nueva revisión para incorporar los cambios.",
  REVISION_NOT_ACTIVE: "Esta revisión ya no está vigente. Recargá la página para ver la revisión actual.",
  FINALIZATION_IN_PROGRESS: "Ya hay una finalización en curso para este documento. Consultá el estado en unos instantes.",
  RECEIPTS_INCOMPLETE: "Faltan constancias de confirmación para completar la finalización. Reintentá en unos instantes.",
  NOT_AVAILABLE: "No se encontró la revisión a finalizar.",
  NO_SESSION: "Tu sesión venció. Volvé a ingresar.",
};

const FALLBACK_ERROR = "No se pudo finalizar por un problema técnico. Podés reintentar.";

function workingLabel(state: FinalizationPanelState): string | null {
  if (state.status === "starting") return "Generando el PDF…";
  if (state.status === "in_progress") return state.phase === "published" ? "Registrando la huella en Hedera…" : "Generando el PDF…";
  if (state.status === "sealing") return "Registrando la huella en Hedera…";
  return null;
}

export function FinalizationPanel({ state, onFinalize, onRefresh }: FinalizationPanelProps) {
  const working = state.status === "starting" || state.status === "in_progress" || state.status === "sealing";
  const label = workingLabel(state);
  return (
    <section aria-labelledby="finalization-title" className="panel flex flex-col gap-3 p-4">
      <h2 id="finalization-title" className="text-lg font-semibold">
        Finalización
      </h2>

      {state.status === "idle" && <p className="text-sm text-muted-foreground">Todos los participantes confirmaron esta revisión. Al finalizar se genera la versión con su PDF y se registra en Hedera Testnet una huella que permite comprobar que el PDF no cambió.</p>}

      {state.status === "published" && (
        <div className="motion-enter">
          <SealRegisteredAlert versionNumber={state.versionNumber} seal={state.seal} />
        </div>
      )}

      {state.status === "failed" && (
        <Alert variant="destructive" className="motion-enter">
          <AlertTitle>No se pudo finalizar</AlertTitle>
          <AlertDescription>{errorTexts[state.code] ?? FALLBACK_ERROR}</AlertDescription>
        </Alert>
      )}

      {state.status === "stalled" && (
        <Alert className="motion-enter">
          <AlertTitle>La finalización sigue en curso</AlertTitle>
          <AlertDescription>
            {state.phase ? `Última fase informada: ${phaseLabels[state.phase]}. ` : ""}Dejamos de consultar automáticamente; podés actualizar el estado o reintentar.
          </AlertDescription>
        </Alert>
      )}

      {/* El PDF final existe desde la publicación, aunque la huella todavía esté pendiente. */}
      {(state.status === "sealing" || state.status === "published" || state.status === "stalled") && state.documentId && state.versionNumber !== undefined && (
        <FinalPdfDownloadLink documentId={state.documentId} versionNumber={state.versionNumber} />
      )}

      {label && (
        <p role="status" aria-live="polite" className="motion-fade flex items-center gap-2 text-sm">
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          {label}
        </p>
      )}

      {state.status !== "published" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onFinalize} disabled={working}>
            {state.status === "failed" || state.status === "stalled" ? (
              "Reintentar"
            ) : (
              <>
                <ArrowUp aria-hidden="true" data-icon="inline-start" />
                Finalizar y registrar huella
              </>
            )}
          </Button>
          {state.status === "stalled" && (
            <Button type="button" variant="outline" onClick={onRefresh}>
              Actualizar estado
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
