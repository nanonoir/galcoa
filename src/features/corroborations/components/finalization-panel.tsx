import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Finalización de la revisión (REQ-12, INV-13/14): presentación pura. Recibe el estado ya
 * resuelto por el container; no consulta red. Las advertencias del contenido no bloquean:
 * solo bloquean las confirmaciones faltantes o un rechazo, y eso lo decide el servidor.
 */

export type FinalizationPhase = "reserved" | "pdf_staged" | "manifest_ready" | "object_checked" | "published";

export type FinalizationPanelState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "in_progress"; phase: FinalizationPhase }
  /** El sondeo agotó su tope: la operación puede seguir avanzando en el servidor. */
  | { status: "stalled"; phase: FinalizationPhase | null }
  | { status: "published"; versionNumber: number }
  | { status: "failed"; code: string };

export interface FinalizationPanelProps {
  state: FinalizationPanelState;
  onFinalize: () => void;
  onRefresh: () => void;
  downloadHref?: string;
  verificationHref?: string;
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

export function FinalizationPanel({ state, onFinalize, onRefresh, downloadHref, verificationHref }: FinalizationPanelProps) {
  const working = state.status === "starting" || state.status === "in_progress";
  return (
    <section aria-labelledby="finalization-title" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="finalization-title" className="text-lg font-semibold">
        Finalización
      </h2>

      {state.status === "idle" && <p className="text-sm text-muted-foreground">Todos los participantes confirmaron esta revisión. Al finalizar se genera la versión con su PDF.</p>}

      {state.status === "published" && (
        <Alert>
          <AlertTitle>Versión {state.versionNumber} publicada</AlertTitle>
          <AlertDescription>La versión quedó finalizada y ya no se puede modificar. El sello puede seguir pendiente: se informa por separado.</AlertDescription>
        </Alert>
      )}

      {state.status === "published" && (
        <div className="flex flex-wrap gap-3 text-sm">
          {downloadHref && <a className="underline" href={downloadHref}>Descargar PDF</a>}
          {verificationHref && <a className="underline" href={verificationHref}>Verificar PDF</a>}
        </div>
      )}

      {state.status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo finalizar</AlertTitle>
          <AlertDescription>{errorTexts[state.code] ?? FALLBACK_ERROR}</AlertDescription>
        </Alert>
      )}

      {state.status === "stalled" && (
        <Alert>
          <AlertTitle>La finalización sigue en curso</AlertTitle>
          <AlertDescription>
            {state.phase ? `Última fase informada: ${phaseLabels[state.phase]}. ` : ""}Dejamos de consultar automáticamente; podés actualizar el estado o reanudar.
          </AlertDescription>
        </Alert>
      )}

      {working && (
        <p role="status" aria-live="polite" className="text-sm">
          {state.status === "starting" ? "Iniciando la finalización…" : `Finalizando: ${phaseLabels[state.phase]}…`}
        </p>
      )}

      {state.status !== "published" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onFinalize} disabled={working}>
            {state.status === "failed" || state.status === "stalled" ? "Reanudar finalización" : "Finalizar"}
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
