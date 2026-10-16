import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ThirdPartyRole } from "@/lib/contracts/review";

/**
 * Compartir manual (MVP-078; REQ-14): un enlace personal por tercero con copiar,
 * WhatsApp y correo. Los abre la persona; la aplicación no envía nada. El QR lo
 * aporta el container por `renderQr` (generado en el navegador, sin servicios
 * externos) cuando se decida la librería (PD-03). Sin enlace en claro (solo
 * existe al emitirlo) se ofrece reemitir.
 */

export interface ShareLinkItem {
  role: ThirdPartyRole;
  /** `null` si el enlace en claro ya no está disponible. */
  url: string | null;
  /** Construidos por el container con `lib/share-links` (la presentación no importa lógica). */
  whatsappUrl: string | null;
  mailtoUrl: string | null;
}

export interface ShareLinksPanelProps {
  links: ShareLinkItem[];
  onCopy: (url: string) => Promise<void> | void;
  onReissue: (role: ThirdPartyRole) => void;
  renderQr?: (url: string, label: string) => ReactNode;
}

const roleLabels: Record<ThirdPartyRole, string> = { intermediario: "Intermediario", comprador: "Comprador" };

function ShareLinkCard({ item, onCopy, onReissue, renderQr }: { item: ShareLinkItem } & Omit<ShareLinksPanelProps, "links">) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const label = roleLabels[item.role];

  async function copy(url: string) {
    try {
      await onCopy(url);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3">
      <h3 className="text-base font-semibold">{label}</h3>
      {item.url === null ? (
        <>
          <p className="text-sm text-muted-foreground">El enlace de este participante ya no se puede mostrar. Si lo perdiste, generá uno nuevo; el anterior deja de funcionar.</p>
          <Button type="button" variant="outline" onClick={() => onReissue(item.role)} className="self-start">
            Generar enlace nuevo para {label.toLowerCase()}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs break-all text-muted-foreground">{item.url}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copy(item.url!)} aria-label={`Copiar enlace de ${label.toLowerCase()}`}>
              {copied ? <Check aria-hidden="true" data-icon="inline-start" /> : <Copy aria-hidden="true" data-icon="inline-start" />}
              {copied ? "Copiado" : "Copiar enlace"}
            </Button>
            <a href={item.whatsappUrl ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp para ${label.toLowerCase()}`} className={buttonVariants({ variant: "outline" })}>
              <MessageCircle aria-hidden="true" data-icon="inline-start" />
              WhatsApp
            </a>
            <a href={item.mailtoUrl ?? undefined} aria-label={`Abrir correo para ${label.toLowerCase()}`} className={buttonVariants({ variant: "outline" })}>
              <Mail aria-hidden="true" data-icon="inline-start" />
              Correo
            </a>
          </div>
          {copyFailed && (
            <p role="alert" className="text-sm text-destructive">
              No se pudo copiar. Seleccioná el enlace de arriba y copialo a mano.
            </p>
          )}
          {renderQr?.(item.url, `Código QR del enlace de ${label.toLowerCase()}`)}
        </>
      )}
    </li>
  );
}

export function ShareLinksPanel({ links, onCopy, onReissue, renderQr }: ShareLinksPanelProps) {
  return (
    <section aria-labelledby="share-links-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 id="share-links-title" className="text-lg font-semibold">
          Compartir con los participantes
        </h2>
        <p className="text-sm text-muted-foreground">Cada enlace es personal. Lo enviás vos: la aplicación no manda correos ni mensajes.</p>
      </header>
      <Alert>
        <AlertTitle>Guardá los enlaces ahora</AlertTitle>
        <AlertDescription>Solo se muestran al generarlos. Si se pierde uno, hay que generar otro y el anterior deja de funcionar.</AlertDescription>
      </Alert>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay otros participantes seleccionados: no hay enlaces para compartir.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((item) => (
            <ShareLinkCard key={item.role} item={item} onCopy={onCopy} onReissue={onReissue} renderQr={renderQr} />
          ))}
        </ul>
      )}
    </section>
  );
}
