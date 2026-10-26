"use client";

import { AlertTriangle, CheckCheck, ExternalLink, Eye, Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Barra de acciones del borrador publicado (demo): Revisar (vista previa del PDF), Confirmar
 * (solo autor, con casilla de ratificación) y Compartir con terceros. Solo presentación: la red
 * y el resultado de cada acción llegan por props/callbacks. La confirmación nunca se muestra como
 * lograda hasta que `confirmed` lo diga.
 */

export interface ChatActionsBarProps {
  /** Ruta de la vista previa; el iframe y el enlace «Abrir en pestaña nueva» apuntan a ella. */
  previewUrl: string;
  /** Entrada al flujo completo con proveedor y comprador, sin confirmar desde el chat. */
  reviewUrl?: string;
  onShare: () => void;
  /** Resuelve `true` solo si el servidor confirmó; entonces el diálogo se cierra. */
  onConfirm: () => Promise<boolean>;
  /** Hay una confirmación registrada de esta versión. */
  confirmed: boolean;
  /** Error visible del último intento de confirmar (código ya traducido a texto). */
  error: string | null;
  /** Área de «Finalizar y registrar huella», una vez que la confirmación está completa. */
  children?: ReactNode;
}

export function ChatActionsBar({ previewUrl, reviewUrl, onShare, onConfirm, confirmed, error, children }: ChatActionsBarProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit() {
    if (!agreed || working) return;
    setWorking(true);
    try {
      if (await onConfirm()) setConfirmOpen(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="chat-actions">
      <div role="group" aria-label="Acciones del borrador" className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
          Revisar
          <Eye aria-hidden="true" />
        </Button>
        {reviewUrl ? (
          <a href={reviewUrl} className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <CheckCheck aria-hidden="true" className="size-4" />
            Revisar y confirmar
          </a>
        ) : <Button
          type="button"
          onClick={() => {
            setAgreed(false);
            setConfirmOpen(true);
          }}
          disabled={confirmed}
        >
          <CheckCheck aria-hidden="true" />
          {confirmed ? "Confirmado" : "Confirmar"}
        </Button>}
        <Button type="button" variant="outline" onClick={onShare}>
          <Share2 aria-hidden="true" />
          Compartir con terceros
        </Button>
      </div>

      {error && !confirmOpen ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudo confirmar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {children}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vista previa del documento</DialogTitle>
            <DialogDescription>Vista previa — no es la versión final.</DialogDescription>
          </DialogHeader>
          <iframe title="Vista previa del PDF" src={previewUrl} className="min-h-0 w-full flex-1 rounded-md border" />
          <DialogFooter>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">
              Abrir en pestaña nueva
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!reviewUrl && confirmOpen} onOpenChange={(next) => (working ? undefined : setConfirmOpen(next))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar esta versión</DialogTitle>
            <DialogDescription>Se congela la versión actual con vos como único participante y se registra tu confirmación.</DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="size-4" />
            Revisé la operación y confirmo esta versión.
          </label>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>No se pudo confirmar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={working}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={!agreed || working}>
              {working ? "Confirmando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
