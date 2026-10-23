import { AlertTriangle, FileText, Info, Plus, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardViewProps } from "@/features/dashboard/contracts/dashboard-view";
import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
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
    <div className="flex min-w-0 flex-col gap-1 bg-muted/40 p-2">
      <dt className="tech-label">{name}</dt>
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
          ? "flex gap-2 border border-destructive/40 bg-destructive/5 p-2"
          : "flex gap-2 border border-border bg-muted/40 p-2"
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
  index,
  onOpen,
}: {
  document: DocumentSummary;
  index: number;
  onOpen: (documentId: string) => void;
}) {
  return (
    // La tarjeta no es un enlace: solo «Abrir» es accionable, así que la fila no recibe hover ni press.
    <li className="motion-enter" style={{ "--enter-delay": `${Math.min(index, 5) * 30}ms` } as CSSProperties}>
      <Card size="sm">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle>
                <h3 className="flex items-start gap-2 text-base font-semibold break-words">
                  <FileText aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">{document.title}</span>
                </h3>
              </CardTitle>
              <p className="tech-label">
                Actualizado <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => onOpen(document.id)}
              aria-label={`Abrir ${document.title}`}
            >
              Abrir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Cuatro dimensiones independientes (PRD §5): ninguna se deriva de otra. */}
          <dl aria-label={`Estado de ${document.title}`} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-4">
            <Dimension name="Documento" value={documentStatusLabels[document.documentStatus]} />
            {!DEMO_HIDE_WARNINGS && (
              <Dimension
                name="Control"
                value={controlStatusLabels[document.controlStatus]}
                tone={controlTones[document.controlStatus]}
              />
            )}
            <Dimension
              name="Confirmaciones"
              value={document.confirmationStatus ? confirmationStatusLabels[document.confirmationStatus] : NO_FROZEN_REVISION}
            />
            <Dimension name="Registro en Hedera" value={hcsStatusLabels[document.hcsStatus]} />
          </dl>
          {!DEMO_HIDE_WARNINGS && document.warnings.length > 0 && (
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
          {/* Identificadores técnicos al final y plegados: son de consulta, no de lectura. */}
          {document.revisionId ? (
            <details className="text-xs text-muted-foreground">
              <summary className="tech-label cursor-pointer">Detalles técnicos</summary>
              <div className="mt-1 flex flex-col gap-1 break-all">
                <p>
                  Revisión <span className="tech-id">{document.revisionId}</span>
                </p>
                {document.snapshotId && (
                  <p>
                    Versión congelada <span className="tech-id">{document.snapshotId}</span>
                  </p>
                )}
              </div>
            </details>
          ) : (
            <p className="tech-label break-all">{NO_FROZEN_REVISION}</p>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

/** Motivo por el que un documento queda pendiente; `null` si no hay nada que atender. */
function pendingReason(document: DocumentSummary): string | null {
  if (document.confirmationStatus === "rechazada" || document.documentStatus === "revision_rechazada") {
    return "Revisión rechazada: corregí y pedí una nueva confirmación";
  }
  if (document.confirmationStatus === "pendiente" || document.confirmationStatus === "parcial") {
    return "Esperando confirmaciones";
  }
  if (document.documentStatus === "finalizado" && (document.hcsStatus === "pendiente" || document.hcsStatus === "fallido")) {
    return "Registro en Hedera pendiente";
  }
  return null;
}

function PendingList({ documents, onOpen }: { documents: DocumentSummary[]; onOpen: (documentId: string) => void }) {
  const items = documents
    .map((document) => ({ document, reason: pendingReason(document) }))
    .filter((item): item is { document: DocumentSummary; reason: string } => item.reason !== null)
    .sort((a, b) => Date.parse(a.document.updatedAt) - Date.parse(b.document.updatedAt));
  if (items.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h3 className="text-base font-semibold">Te falta</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-label="Te falta" className="flex flex-col gap-2 text-sm">
          {items.map(({ document, reason }) => (
            <li key={document.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{document.title}</span>
                <span className="text-muted-foreground">{reason}</span>
              </div>
              <Button
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                onClick={() => onOpen(document.id)}
                aria-label={`Abrir pendiente: ${document.title}`}
              >
                Abrir
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DashboardReference({ state, onCreate, onOpen, onRetry }: DashboardViewProps) {
  return (
    <section aria-labelledby="dashboard-reference-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 id="dashboard-reference-title" className="text-lg font-semibold">
            Documentos
          </h2>
          {state.status === "ready" && state.documents.length > 0 && (
            <p className="tech-label">{countLabel(state.documents.length, "documento", "documentos")}</p>
          )}
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
        <div className="flex flex-col items-center gap-2 border border-dashed p-8 text-center">
          <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium">Todavía no hay documentos.</p>
          <p className="mt-2 font-medium">Tu primera entrega sellada, en 4 pasos:</p>
          <ol className="flex max-w-prose list-inside list-decimal flex-col gap-1 text-left text-sm">
            <li>
              <strong>Creá tu primer documento:</strong> uno por entrega.
            </li>
            <li>
              <strong>Contá la entrega y revisá el documento:</strong> escribí qué entregaste y adjuntá el remito.
            </li>
            <li>
              <strong>Pedí la confirmación:</strong> compartí el enlace o QR con el comercio.
            </li>
            <li>
              <strong>Sellá la huella:</strong> con todas las confirmaciones se genera el PDF y se registra una huella que permite comprobar que no cambió.
            </li>
          </ol>
          <Button onClick={() => onCreate()} className="mt-2">
            Crear mi primer documento
          </Button>
        </div>
      )}

      {state.status === "ready" && state.documents.length > 0 && <PendingList documents={state.documents} onOpen={onOpen} />}

      {state.status === "ready" && state.documents.length > 0 && (
        <ul aria-labelledby="dashboard-reference-title" className="flex flex-col gap-3">
          {state.documents.map((document, index) => (
            <DocumentItem key={document.id} document={document} index={index} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
