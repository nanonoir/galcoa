"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await onCopy(hash);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label="Copiar hash del documento">
        {state === "copied" ? <Check aria-hidden="true" data-icon="inline-start" /> : <Copy aria-hidden="true" data-icon="inline-start" />}
        {state === "copied" ? "Copiado" : "Copiar"}
      </Button>
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
      <AlertTitle>Contrato subido. Huella registrada en Hedera Testnet.</AlertTitle>
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
        {documentHash && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tech-label">Hash del documento</span>
            <code className="font-mono text-xs" title={documentHash}>
              {shortHash(documentHash)}
            </code>
            {onCopy && <CopyHash hash={documentHash} onCopy={onCopy} />}
          </div>
        )}
        <p className="font-mono text-xs break-all text-muted-foreground">
          Topic {seal.topicId} · Secuencia {seal.sequenceNumber}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a className="font-medium underline underline-offset-4" href={`/verify/${encodeURIComponent(seal.reference)}`}>
            Ver verificación
          </a>
          <a
            className="font-medium underline underline-offset-4"
            href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(seal.consensusTimestamp)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en HashScan
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
      <h2 id="sealed-version-title" className="tech-label">
        Versión {version.versionNumber}
      </h2>

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
          <AlertTitle>{retrying ? "Contrato subido. Registrando la huella en Hedera…" : "Contrato subido. Huella pendiente."}</AlertTitle>
          <AlertDescription>
            <p>
              La versión {version.versionNumber} quedó finalizada y ya no se puede modificar.{" "}
              {seal.status === "fallido" ? "El último intento de registro no se completó." : "La huella todavía no quedó registrada en Hedera Testnet."}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tech-label">Hash del documento</span>
              <code className="font-mono text-xs" title={version.documentHash}>
                {shortHash(version.documentHash)}
              </code>
              <CopyHash hash={version.documentHash} onCopy={onCopy} />
            </div>
            {retrying && (
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
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
    </section>
  );
}
