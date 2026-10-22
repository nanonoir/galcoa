import { AlertTriangle, FileText, Info, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SnapshotViewProps } from "@/features/documents/contracts/snapshot-view";
import { AlcTrafficLight } from "@/features/documents/components/alc-traffic-light";
import type { ConfirmationStatus, ControlStatus, DocumentStatus, HcsStatus } from "@/lib/contracts/document";
import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import type { ParticipantRole, SharedWarning } from "@/lib/contracts/review";

/**
 * Presentación de solo lectura del snapshot congelado (MVP-112; PRD REQ-08,
 * INV-02, INV-11, INV-14). Solo formatea valores recibidos: no confirma,
 * rechaza, congela ni finaliza, y ninguna advertencia (ni la crítica)
 * deshabilita acciones. No muestra ids internos de revisión ni de snapshot.
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

const severityLabels: Record<SharedWarning["severity"], string> = {
  warning: "Advertencia",
  critical: "Crítica",
};

const roleLabels: Record<ParticipantRole, string> = {
  autor: "Autor",
  intermediario: "Intermediario",
  comprador: "Comprador",
};

/** Snapshots v2: los roles internos se muestran como proveedor / transportista / comprador. */
const roleLabelsV2: Record<ParticipantRole, string> = {
  autor: "Proveedor",
  intermediario: "Transportista",
  comprador: "Comprador",
};

/** Sin estado de confirmaciones no se informa ninguno (`null` ≠ completa). */
const NO_CONFIRMATION_STATUS = "Sin revisión congelada";

type Tone = "neutral" | "attention";

function confirmationLabel(status: ConfirmationStatus | null) {
  return status ? confirmationStatusLabels[status] : NO_CONFIRMATION_STATUS;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function Dimension({ name, value, tone = "neutral" }: { name: string; value: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border bg-muted/40 p-2">
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

function WarningCard({ warning }: { warning: SharedWarning }) {
  const critical = warning.severity === "critical";
  return (
    <li
      className={
        critical
          ? "flex gap-2 border border-destructive/40 bg-destructive/5 p-3"
          : "flex gap-2 border border-border bg-muted/40 p-3"
      }
    >
      {critical ? (
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <p className="break-words">
          <strong>{severityLabels[warning.severity]}:</strong> {warning.message}
        </p>
        {/* Todas las fuentes visibles, sin colapsar; si no hay, no se inventan. */}
        <div className="flex flex-col gap-1 text-xs">
          <p className="font-medium">Fuentes</p>
          {warning.sources.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {warning.sources.map((source, index) => (
                <li key={`${source.alias}-${index}`} className="break-words text-muted-foreground">
                  <span className="font-medium text-foreground">{source.alias}:</span> {source.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No informadas.</p>
          )}
        </div>
      </div>
    </li>
  );
}

export function SnapshotView({ state, onRetry }: SnapshotViewProps) {
  return (
    <section aria-labelledby="snapshot-view-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex min-w-0 flex-col gap-1">
        <h2 id="snapshot-view-title" className="text-lg font-semibold">
          Snapshot congelado
        </h2>
        <p className="text-sm text-muted-foreground">Contenido de la revisión, solo lectura.</p>
      </header>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Cargando la versión congelada…</p>
          <Skeleton aria-hidden="true" className="h-20 w-full" />
          <Skeleton aria-hidden="true" className="h-40 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudo cargar la versión congelada</AlertTitle>
          <AlertDescription>
            <p className="break-words">{state.message}</p>
            <Button variant="outline" className="mt-2" onClick={() => onRetry()}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "empty" && (
        <div className="flex flex-col items-center gap-2 border border-dashed p-6 text-center">
          <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium">Todavía no hay una revisión congelada.</p>
          <p className="text-sm text-muted-foreground">La versión congelada aparece cuando se congela una revisión.</p>
        </div>
      )}

      {state.status === "ready" && <ReadySnapshot state={state} />}
    </section>
  );
}

function ReadySnapshot({ state }: { state: Extract<SnapshotViewProps["state"], { status: "ready" }> }) {
  const { operation, warnings, selection } = state.content;
  const alc = "alc" in state.content ? state.content : null;
  const roleNames = alc ? roleLabelsV2 : roleLabels;
  // Defensa: un estado de confirmaciones ausente nunca se lee como «Completa».
  const confirmationStatus: ConfirmationStatus | null = state.confirmationStatus ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader className="gap-2">
          <CardTitle>
            <h3 className="flex items-start gap-2 text-base font-semibold break-words">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{operation.title}</span>
            </h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {/* Cuatro dimensiones independientes (PRD §5): ninguna se deriva de otra. Son el avance actual, no una foto. */}
          <p className="tech-label">Avance actual</p>
          <p className="text-xs text-muted-foreground">
            El contenido de abajo está congelado y no cambia. Estos estados muestran el avance actual y pueden cambiar después de congelar.
          </p>
          <dl aria-label="Estado del snapshot" className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-4">
            <Dimension name="Documento" value={documentStatusLabels[state.documentStatus]} />
            {!DEMO_HIDE_WARNINGS && (
              <Dimension
                name="Control"
                value={controlStatusLabels[state.controlStatus]}
                tone={state.controlStatus === "contradiccion_critica" ? "attention" : "neutral"}
              />
            )}
            <Dimension name="Confirmaciones" value={confirmationLabel(confirmationStatus)} />
            <Dimension name="Registro en Hedera" value={hcsStatusLabels[state.hcsStatus]} />
          </dl>
          {!DEMO_HIDE_WARNINGS && state.controlStatus === "sin_inconsistencias_criticas_detectadas" && (
            <p className="text-xs text-muted-foreground">
              Que no se hayan detectado inconsistencias críticas no significa que los datos estén corroborados.
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="snapshot-content-title" className="flex min-w-0 flex-col gap-2">
        <h3 id="snapshot-content-title" className="text-base font-semibold">
          Contenido
        </h3>
        {/* Texto completo como contenido (React escapa: nunca HTML arbitrario). Borde amarillo = contenido congelado. */}
        <p className="border border-border p-3 text-base break-words whitespace-pre-line">{operation.body}</p>
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Correcciones aplicadas</p>
          {operation.corrections.length > 0 ? (
            <ul className="list-disc pl-5">
              {operation.corrections.map((correction, index) => (
                <li key={`${correction}-${index}`} className="break-words">
                  {correction}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Ninguna.</p>
          )}
        </div>
        <p className="text-sm break-words">
          <span className="font-medium">Participantes seleccionados:</span>{" "}
          {selection.map((role) => roleNames[role]).join(", ")}
        </p>
      </section>

      {alc && <AlcTrafficLight alc={alc.alc} rectifications={alc.rectifications} />}

      {!DEMO_HIDE_WARNINGS && (
        <section aria-labelledby="snapshot-warnings-title" className="flex min-w-0 flex-col gap-2">
          <h3 id="snapshot-warnings-title" className="text-base font-semibold">
            Advertencias
          </h3>
          {warnings.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                {countLabel(warnings.length, "advertencia", "advertencias")}. Informativas: no bloquean confirmar ni
                finalizar.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {warnings.map((warning) => (
                  <WarningCard key={warning.id} warning={warning} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Este snapshot no tiene advertencias registradas.</p>
          )}
        </section>
      )}
    </div>
  );
}
