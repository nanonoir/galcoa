"use client";

import QRCode from "react-qr-code";

/**
 * QR del enlace de un participante, dibujado en el navegador como SVG (MVP-078).
 * No usa red ni servicios externos: el enlace en claro no sale de esta pantalla.
 * El enlace en texto sigue visible junto al QR como alternativa.
 */
export function ShareQr({ url, label }: { url: string; label: string }) {
  return (
    <div className="w-fit rounded-md border bg-white p-3">
      <QRCode value={url} size={160} level="M" role="img" aria-label={label} />
    </div>
  );
}
