"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTransientState } from "@/components/ui/use-transient-state";
import type { SealedVersionView } from "@/lib/contracts/sealed-version-view";

/**
 * Última versión publicada con su sello (REQ-12; INV-05/06). Presentación pura: el estado llega ya
 * resuelto del servidor y el reintento del registro, por `onRetry`. Solo hashes e identificadores
 * públicos. `SealRegisteredAlert` es el bloque «Huella registrada» que también usa la finalización.
 */

export interface SealRegisteredInfo {
  reference: string;
  topicId: string;
  sequenceNumber: string;
  consensusTimestamp: string;
}

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Hash largo en una línea legible: inicio…final; el valor completo se copia. */
function shortHash(hash: string) {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

function CopyHash({ hash, onCopy }: { hash: string; onCopy: (value: string) => Promise<void> | void }) {
  const [state, setState] = useTransientState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await onCopy(hash);
      setState("copied");
    } catch {
      setState("failed", 5000);
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label="Copiar huella digital">
        {state === "copied" ? (
          <Check key="copied" aria-hidden="true" data-icon="inline-start" className="motion-fade" />
        ) : (
          <Copy key="idle" aria-hidden="true" data-icon="inline-start" />
        )}
        {state === "copied" ? "Copiado" : "Copiar"}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Huella copiada al portapapeles" : ""}
      </span>
      {state === "failed" && <span className="text-xs text-destructive">No se pudo copiar.</span>}
    </span>
  );
}

export function SealRegisteredAlert({
  versionNumber,
  seal,
  documentHash,
  finalizedAt,
  onCopy,
}: {
  versionNumber: number;
  seal: SealRegisteredInfo;
  documentHash?: string;
  finalizedAt?: string;
  onCopy?: (value: string) => Promise<void> | void;
}) {
  return (
    <Alert>
      <AlertTitle>Versión finalizada. Huella registrada en Hedera Testnet.</AlertTitle>
      <AlertDescription>
        <p>
          La versión {versionNumber} quedó finalizada y ya no se puede modificar.
          {finalizedAt && (
            <>
              {" "}
              <time dateTime={finalizedAt}>{dateFormat.format(new Date(finalizedAt))} UTC</time>
            </>
          )}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="tech-label cursor-pointer">Detalles técnicos</summary>
          <div className="mt-1 flex flex-col gap-1">
            {documentHash && (
              <span className="flex flex-wrap items-center gap-2">
                <span className="tech-label">Huella digital</span>
                <code className="tech-id" title={documentHash}>
                  {shortHash(documentHash)}
                </code>
                {onCopy && <CopyHash hash={documentHash} onCopy={onCopy} />}
              </span>
            )}
            <p className="tech-id text-muted-foreground">
              Topic {seal.topicId} · Secuencia {seal.sequenceNumber}
            </p>
            <p>
              <a
                className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(seal.consensusTimestamp)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver en HashScan
              </a>
            </p>
          </div>
        </details>
        <p className="flex flex-wrap gap-x-4 gap-y-2">
          <a className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={`/verify/${encodeURIComponent(seal.reference)}`}>
            Ver verificación
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}

export interface SealedVersionCardProps {
  version: SealedVersionView;
  onCopy: (value: string) => Promise<void> | void;
  onRetry: () => void;
  /** Hay un reintento del registro en curso. */
  retrying?: boolean;
  /** El último reintento no pudo completarse. */
  retryFailed?: boolean;
}

export function SealedVersionCard({ version, onCopy, onRetry, retrying = false, retryFailed = false }: SealedVersionCardProps) {
  const { seal } = version;
  return (
    <section aria-labelledby="sealed-version-title" className="panel flex flex-col gap-3 p-4" data-testid="sealed-version-card">
      <h2 id="sealed-version-title" className="text-lg font-semibold">
        Versión {version.versionNumber}
      </h2>
      <p className="tech-label">Versión finalizada · el PDF existe desde la publicación · Registro en Hedera: paso aparte</p>

      {seal.status === "registrado" ? (
        <SealRegisteredAlert
          versionNumber={version.versionNumber}
          seal={{ reference: version.reference, ...seal }}
          documentHash={version.documentHash}
          finalizedAt={version.finalizedAt}
          onCopy={onCopy}
        />
      ) : (
        <Alert>
          <AlertTitle>{retrying ? "Versión finalizada. Registrando la huella en Hedera…" : "Versión finalizada. Huella pendiente."}</AlertTitle>
          <AlertDescription>
            <p>
              La versión {version.versionNumber} quedó finalizada y ya no se puede modificar.{" "}
              {seal.status === "fallido" ? "El último intento de registro no se completó." : "La huella todavía no quedó registrada en Hedera Testnet."}
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="tech-label cursor-pointer">Detalles técnicos</summary>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tech-label">Huella digital</span>
                <code className="tech-id" title={version.documentHash}>
                  {shortHash(version.documentHash)}
                </code>
                <CopyHash hash={version.documentHash} onCopy={onCopy} />
              </div>
            </details>
            {retrying && (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                Registrando la huella en Hedera…
              </p>
            )}
            {retryFailed && !retrying && <p className="text-sm text-destructive">No se pudo reintentar el registro. Probá de nuevo en unos instantes.</p>}
            <div>
              <Button type="button" onClick={onRetry} disabled={retrying}>
                Reintentar registro
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* El PDF final ya existe desde la publicación, con o sin huella registrada: son estados distintos. */}
      <FinalPdfDownloadLink documentId={version.documentId} versionNumber={version.versionNumber} />
    </section>
  );
}

/** Descarga directa del PDF final inmutable de una versión publicada; independiente del estado del sello. */
export function FinalPdfDownloadLink({ documentId, versionNumber }: { documentId: string; versionNumber: number }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <a
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        href={`/api/documents/${encodeURIComponent(documentId)}/versions/${versionNumber}/pdf`}
        download
      >
        <Download aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />
        Descargar PDF final (versión {versionNumber})
      </a>
      <span className="text-xs text-muted-foreground">Es el archivo inmutable de esta versión; no se vuelve a generar.</span>
    </p>
  );
}
