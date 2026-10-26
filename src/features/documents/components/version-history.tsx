import { AlertTriangle, Check, Download, History, RotateCcw } from "lucide-react";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { VersionHistoryViewProps } from "@/features/documents/contracts/version-history-view";
import type { HcsStatus } from "@/lib/contracts/document";
import type { VersionHistoryItem } from "@/lib/contracts/version-history-view";

/**
 * Presentación del historial de versiones (MVP-113; REQ-09, INV-05, INV-18).
 * Solo lectura: lista las versiones recibidas y anuncia la seleccionada. No
 * edita, no regenera PDF ni reintenta el sello; la única acción sobre una
 * versión es `onSelect(versionId)`. Finalización y sello se muestran como
 * estados separados: toda versión del historial está finalizada y su sello
 * puede seguir pendiente (un intento `fallido` no deshace la finalización).
 */

// Record exhaustivo: si el contrato añade un valor, TypeScript obliga a etiquetarlo.
// Solo `registrado` se lee como sello registrado; el resto es sello pendiente.
const sealLabels: Record<HcsStatus, { summary: string; detail: string | null; registered: boolean }> = {
  registrado: { summary: "Sello registrado", detail: null, registered: true },
  pendiente: { summary: "Sello pendiente", detail: null, registered: false },
  no_iniciado: { summary: "Sello pendiente", detail: "El registro todavía no se inició.", registered: false },
  fallido: { summary: "Sello pendiente", detail: "El último intento de registro no se completó.", registered: false },
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  return `${dateFormat.format(new Date(iso))} UTC`;
}

/** Antecedente por número visible: los IDs técnicos no se muestran como contenido. */
function previousLabel(version: VersionHistoryItem, numbers: ReadonlyMap<string, number>) {
  if (version.previousVersionId === null) return "Primera versión";
  const previous = numbers.get(version.previousVersionId);
  return previous === undefined ? "Versión anterior no disponible en este historial" : `Sustituye a la versión ${previous}`;
}

function VersionItem({
  version,
  previous,
  selected,
  onSelect,
  pdfHref,
}: {
  version: VersionHistoryItem;
  previous: string;
  selected: boolean;
  onSelect: (versionId: string) => void;
  pdfHref?: string;
}) {
  const seal = sealLabels[version.hcsStatus];
  const finalizedAt = formatDate(version.finalizedAt);
  // Nombre accesible corto («Versión N»); estados y antecedente como descripción.
  const id = useId();
  return (
    <li className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-details`}
        onClick={() => onSelect(version.versionId)}
        className={
          "flex w-full min-w-0 flex-col gap-2 border p-4 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
          (selected ? "border-ring bg-accent" : "border-border bg-card") +
          (pdfHref ? " border-b-0" : "")
        }
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span id={`${id}-name`} className="text-base font-semibold">
            Versión {version.number}
          </span>
          {selected && (
            <Badge>
              <Check aria-hidden="true" data-icon="inline-start" />
              Seleccionada
            </Badge>
          )}
        </span>
        {/* Descripción accesible en una sola frase; el bloque visible la repite con formato. */}
        <span id={`${id}-details`} className="sr-only">
          {`${previous}. Finalización: versión finalizada el ${finalizedAt}. Registro en Hedera: ${seal.summary.toLowerCase()}.${seal.detail ? ` ${seal.detail}` : ""}`}
        </span>
        <span aria-hidden="true" className="flex min-w-0 flex-col gap-2">
          <span className="text-xs break-words text-muted-foreground">{previous}</span>
          {/* Dos estados independientes (PRD §5): la finalización no se deriva del sello. */}
          <span className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <span className="flex min-w-0 flex-col gap-1 bg-muted/40 p-2">
              <span className="tech-label">Finalización</span>
              <span className="break-words">
                Versión finalizada · <time dateTime={version.finalizedAt}>{finalizedAt}</time>
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-1 bg-muted/40 p-2">
              <span className="tech-label">Registro en Hedera</span>
              <span>
                <Badge variant={seal.registered ? "secondary" : "outline"} className="h-auto max-w-full text-left break-words whitespace-normal">
                  {seal.summary}
                </Badge>
              </span>
              {seal.detail && <span className="text-xs break-words text-muted-foreground">{seal.detail}</span>}
            </span>
          </span>
        </span>
      </button>
      {/* Hermano del botón (no anidado): descarga el PDF final ya almacenado de esta versión. */}
      {pdfHref && (
        <a
          href={pdfHref}
          download
          aria-label={`Descargar PDF de la versión ${version.number}`}
          className={
            "inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 " +
            (selected ? "border-ring" : "border-border")
          }
        >
          <Download aria-hidden="true" className="size-4" />
          Descargar PDF
        </a>
      )}
    </li>
  );
}

export function VersionHistory({ state, selectedVersionId, onSelect, onRetry, pdfHref }: VersionHistoryViewProps & { pdfHref?: (versionNumber: number) => string }) {
  return (
    <section aria-labelledby="version-history-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex min-w-0 flex-col gap-1">
        <h2 id="version-history-title" className="text-lg font-semibold">
          Historial de versiones
        </h2>
        <p className="text-sm text-muted-foreground">
          Solo lectura. Las versiones finalizadas no se modifican; la más reciente aparece primero.
        </p>
      </header>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Cargando historial de versiones…</p>
          <Skeleton aria-hidden="true" className="h-24 w-full" />
          <Skeleton aria-hidden="true" className="h-24 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudo cargar el historial de versiones</AlertTitle>
          <AlertDescription>
            <p className="break-words">{state.message}</p>
            <Button variant="outline" className="mt-2" onClick={() => onRetry()}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Reintentar carga
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "ready" && state.versions.length === 0 && (
        <div className="flex flex-col items-center gap-2 border border-dashed p-6 text-center">
          <History aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="font-medium">Todavía no hay versiones finalizadas.</p>
          <p className="text-sm text-muted-foreground">Cada versión aparecerá acá cuando se finalice.</p>
        </div>
      )}

      {state.status === "ready" && state.versions.length > 0 && (
        <VersionList versions={state.versions} selectedVersionId={selectedVersionId} onSelect={onSelect} pdfHref={pdfHref} />
      )}
    </section>
  );
}

function VersionList({
  versions,
  selectedVersionId,
  onSelect,
  pdfHref,
}: {
  versions: readonly VersionHistoryItem[];
  selectedVersionId: string | null;
  onSelect: (versionId: string) => void;
  pdfHref?: (versionNumber: number) => string;
}) {
  const numbers = new Map(versions.map((v) => [v.versionId, v.number]));
  // Más reciente primero, sin mutar el estado recibido.
  const ordered = [...versions].sort((a, b) => b.number - a.number);
  return (
    <ul aria-labelledby="version-history-title" className="flex flex-col gap-3">
      {ordered.map((version) => (
        <VersionItem
          key={version.versionId}
          version={version}
          previous={previousLabel(version, numbers)}
          selected={version.versionId === selectedVersionId}
          onSelect={onSelect}
          pdfHref={pdfHref?.(version.number)}
        />
      ))}
    </ul>
  );
}
