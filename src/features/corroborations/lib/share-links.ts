/**
 * Mensajes y enlaces de compartir manual (MVP-078; REQ-14, PRD §5/§11).
 * Solo funciones puras: el usuario abre `wa.me` o `mailto:` por su cuenta; el
 * backend no envía nada. El texto lleva una frase genérica y el enlace
 * personal: nunca contenido de la operación, nombres ni evidencias.
 */

export const SHARE_MESSAGE_INTRO =
  "Te comparto una revisión de operación para que la leas y confirmes o rechaces:";
export const SHARE_MESSAGE_OUTRO = "El enlace es personal para esta solicitud.";
export const SHARE_EMAIL_SUBJECT = "Revisión de operación para confirmar";

/** Solo se comparten enlaces https (o http en localhost para desarrollo). */
function assertShareableLink(link: string): URL {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("El enlace a compartir no es una URL válida.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("El enlace a compartir debe usar https.");
  }
  return url;
}

export function buildShareText(link: string): string {
  const url = assertShareableLink(link).toString();
  return `${SHARE_MESSAGE_INTRO} ${url} ${SHARE_MESSAGE_OUTRO}`;
}

export function buildWhatsAppUrl(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShareText(link))}`;
}

export function buildMailtoUrl(link: string): string {
  const body = buildShareText(link);
  return `mailto:?subject=${encodeURIComponent(SHARE_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
