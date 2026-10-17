import { AlertTriangle, FileText, Info, Plus, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardViewProps } from "@/features/dashboard/contracts/dashboard-view";
import type {
  ConfirmationStatus,
  ControlStatus,
  DocumentStatus,
  DocumentSummary,
  DocumentWarning,
  HcsStatus,
} from "@/lib/contracts/document";

/**
 * Presentación del historial de documentos (MVP-111, REQ-02). Solo formatea
 * valores recibidos: no calcula estados, permisos ni éxito de persistencia, y
 * las acciones se limitan a invocar los callbacks provistos.
 */

// Records exhaustivos: si el contrato añade un valor, TypeScript obliga a etiquetarlo.
const documentStatusLabels: Record<DocumentStatus, string> = {
  borrador: "Borrador",
  listo_para_revision: "Listo para revisión",
  esperando_confirmaciones: "Esperando confirmaciones",
  revision_rechazada: "Revisión rechazada",
  revision_sustituida: "Revisión sustituida",
  finalizado: "Finalizado",
};

const controlStatusLabels: Record<ControlStatus, string> = {
  sin_evaluar: "Sin evaluar",
  con_advertencias: "Con advertencias",
  contradiccion_critica: "Contradicción crítica",
  sin_inconsistencias_criticas_detectadas: "Sin inconsistencias críticas detectadas",
};

const confirmationStatusLabels: Record<ConfirmationStatus, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  completa: "Completa",
  rechazada: "Rechazada",
  sustituida: "Sustituida",
};

const hcsStatusLabels: Record<HcsStatus, string> = {
  no_iniciado: "No iniciado",
  pendiente: "Pendiente",
  registrado: "Registrado",
  fallido: "Fallido",
};

const severityLabels: Record<DocumentWarning["severity"], string> = {
  warning: "Advertencia",
  critical: "Advertencia crítica",
};

/** Sin revisión congelada no hay confirmaciones que informar (`null` ≠ completa). */
const NO_FROZEN_REVISION = "Sin revisión congelada";

// El color solo acompaña: el texto de cada estado ya lo nombra.
type Tone = "neutral" | "attention";
const controlTones: Record<ControlStatus, Tone> = {
  sin_evaluar: "neutral",
  con_advertencias: "neutral",
  contradiccion_critica: "attention",
  sin_inconsistencias_criticas_detectadas: "neutral",
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  return `${dateFormat.format(new Date(iso))} UTC`;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function Dimension({ name, value, tone = "neutral" }: { name: string; value: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted/40 p-2">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="min-w-0">
        <Badge
          variant={tone === "attention" ? "destructive" : "outline"}
          className="h-auto max-w-full text-left break-words whitespace-normal"
        >
          {value}
        </Badge>
      </dd>
    </div>
  );
}

function WarningItem({ warning }: { warning: DocumentWarning }) {
  const critical = warning.severity === "critical";
  return (
    <li
      className={
        critical
          ? "flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2"
          : "flex gap-2 rounded-lg border border-border bg-muted/40 p-2"
      }
    >
      {critical ? (
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="break-words">
          <strong>{severityLabels[warning.severity]}:</strong> {warning.message}
        </p>
        <p className="text-xs break-words text-muted-foreground">
          {warning.sources.length > 0 ? `Fuentes: ${warning.sources.join(", ")}` : "Fuentes: no informadas"}
        </p>
      </div>
    </li>
  );
}

function DocumentItem({
  document,
  onOpen,
}: {
  document: DocumentSummary;
  onOpen: (documentId: string) => void;
}) {
  return (
    <li>
      <Card size="sm">
        <CardHeader className="gap-2">
          <CardTitle>
            <h3 className="flex items-start gap-2 text-base font-semibold break-words">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{document.title}</span>
            </h3>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Actualizado <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
          </p>
          <p className="text-xs break-all text-muted-foreground">
            {document.revisionId ? (
              <>
                Revisión <span className="font-mono">{document.revisionId}</span>
                {document.snapshotId && (
                  <>
                    {" · "}snapshot <span className="font-mono">{document.snapshotId}</span>
                  </>
                )}
              </>
            ) : (
              NO_FROZEN_REVISION
            )}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Cuatro dimensiones independientes (PRD §5): ninguna se deriva de otra. */}
          <dl aria-label={`Estado de ${document.title}`} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-4">
            <Dimension name="Documento" value={documentStatusLabels[document.documentStatus]} />
            <Dimension
              name="Control"
              value={controlStatusLabels[document.controlStatus]}
              tone={controlTones[document.controlStatus]}
            />
            <Dimension
              name="Confirmaciones"
              value={document.confirmationStatus ? confirmationStatusLabels[document.confirmationStatus] : NO_FROZEN_REVISION}
            />
            <Dimension name="Sello HCS" value={hcsStatusLabels[document.hcsStatus]} />
          </dl>
          {document.warnings.length > 0 && (
            <section aria-label={`Advertencias de ${document.title}`} className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {countLabel(document.warnings.length, "advertencia", "advertencias")}. Informativas: no bloquean confirmar ni finalizar.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {document.warnings.map((warning) => (
                  <WarningItem key={warning.id} warning={warning} />
                ))}
              </ul>
            </section>
          )}
          <div>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpen(document.id)}
              aria-label={`Abrir ${document.title}`}
            >
              Abrir
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function DashboardReference({ state, onCreate, onOpen, onRetry }: DashboardViewProps) {
  return (
    <section aria-labelledby="dashboard-reference-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="dashboard-reference-title" className="text-lg font-semibold">
            Documentos
          </h2>
          <p className="text-sm text-muted-foreground">
            {state.status === "ready" && state.documents.length > 0
              ? `Historial de documentos · ${countLabel(state.documents.length, "documento", "documentos")}`
              : "Historial de documentos"}
          </p>
        </div>
        <Button onClick={() => onCreate()} className="w-full sm:w-auto">
          <Plus aria-hidden="true" data-icon="inline-start" />
          Crear documento
        </Button>
      </header>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Cargando documentos…</p>
          <Skeleton aria-hidden="true" className="h-28 w-full" />
          <Skeleton aria-hidden="true" className="h-28 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudieron cargar los documentos</AlertTitle>
          <AlertDescription>
            <p className="break-words">{state.message}</p>
            <Button variant="outline" className="mt-2" onClick={() => onRetry()}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "ready" && state.documents.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium">Todavía no hay documentos.</p>
          <p className="text-sm text-muted-foreground">Crea el primero con «Crear documento».</p>
        </div>
      )}

      {state.status === "ready" && state.documents.length > 0 && (
        <ul aria-labelledby="dashboard-reference-title" className="flex flex-col gap-3">
          {state.documents.map((document) => (
            <DocumentItem key={document.id} document={document} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
