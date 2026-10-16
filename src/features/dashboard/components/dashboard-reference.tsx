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
 * Componente de REFERENCIA para el patrón de props/callbacks/estados/a11y.
 * No es el dashboard que se delega: no cubre filtros, orden ni responsive
 * completo. Solo formatea valores recibidos; no calcula estados ni autoridad.
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

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function Dimension({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd>
        <Badge variant="outline">{value}</Badge>
      </dd>
    </div>
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
        <CardHeader>
          <CardTitle>
            <h3>{document.title}</h3>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Actualizado <time dateTime={document.updatedAt}>{dateFormat.format(new Date(document.updatedAt))} UTC</time>
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Cuatro dimensiones independientes (PRD §5): ninguna se deriva de otra. */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dimension name="Documento" value={documentStatusLabels[document.documentStatus]} />
            <Dimension name="Control" value={controlStatusLabels[document.controlStatus]} />
            <Dimension
              name="Confirmaciones"
              value={document.confirmationStatus ? confirmationStatusLabels[document.confirmationStatus] : "Sin revisión congelada"}
            />
            <Dimension name="Sello HCS" value={hcsStatusLabels[document.hcsStatus]} />
          </dl>
          {document.warnings.length > 0 && (
            <section aria-label={`Advertencias de ${document.title}`}>
              <p className="text-xs text-muted-foreground">Informativas: no bloquean confirmar ni finalizar.</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {document.warnings.map((warning) => (
                  <li key={warning.id}>
                    <strong>{severityLabels[warning.severity]}:</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={() => onOpen(document.id)} aria-label={`Abrir ${document.title}`}>
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
    <section aria-labelledby="dashboard-reference-title" className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h2 id="dashboard-reference-title" className="text-lg font-semibold">
          Documentos
        </h2>
        <Button onClick={onCreate}>Crear documento</Button>
      </header>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Cargando documentos…</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los documentos</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "ready" && state.documents.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay documentos. Crea el primero para empezar.</p>
      )}

      {state.status === "ready" && state.documents.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.documents.map((document) => (
            <DocumentItem key={document.id} document={document} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
