"use client";

import { useRef, useState } from "react";

import { PublicVerifier } from "@/features/documents/components/public-verifier";
import { PublicVerificationSchema, type PublicVerification } from "@/lib/contracts/public";

/**
 * Container del verificador público (MVP-101). Posee la red: sube el PDF elegido por multipart a
 * `/api/verify/[reference]` y valida la respuesta con el contrato público. El archivo solo viaja al
 * servidor de la propia aplicación. El servidor decide; sin éxito optimista ni resultado local.
 */

const MESSAGES = {
  tooLarge: "El archivo supera el máximo de 10 MiB.",
  notPdf: "El archivo debe ser un PDF.",
  limited: "Hiciste muchos intentos seguidos. Esperá un minuto y reintentá.",
  generic: "No pudimos verificar el archivo. Probá de nuevo en unos minutos.",
};

export type VerifierContainerProps = {
  reference: string;
  initial: PublicVerification;
  /** Inyectable en pruebas; por defecto el `fetch` del navegador. */
  fetchImpl?: typeof fetch;
};

export function VerifierContainer({ reference, initial, fetchImpl }: VerifierContainerProps) {
  const [verification, setVerification] = useState(initial);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Descarta respuestas de una elección anterior si el usuario cambió o quitó el archivo.
  const generation = useRef(0);

  async function onFileSelected(file: File) {
    const mine = ++generation.current;
    setIsVerifying(true);
    setErrorMessage(null);
    const body = new FormData();
    body.append("file", file);
    let message: string | null = null;
    let next: PublicVerification | null = null;
    try {
      const response = await (fetchImpl ?? fetch)(`/api/verify/${encodeURIComponent(reference)}`, {
        method: "POST",
        body,
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (response.ok) {
        const parsed = PublicVerificationSchema.safeParse(await response.json().catch(() => null));
        if (parsed.success) next = parsed.data;
        else message = MESSAGES.generic;
      } else if (response.status === 413) message = MESSAGES.tooLarge;
      else if (response.status === 400 || response.status === 415) message = MESSAGES.notPdf;
      else if (response.status === 429) message = MESSAGES.limited;
      else message = MESSAGES.generic;
    } catch {
      message = MESSAGES.generic;
    }
    if (mine !== generation.current) return;
    if (next) setVerification(next);
    setErrorMessage(message);
    setIsVerifying(false);
  }

  function onClearFile() {
    generation.current++;
    setIsVerifying(false);
    setErrorMessage(null);
    setVerification(initial);
  }

  return (
    <PublicVerifier
      verification={verification}
      isVerifying={isVerifying}
      errorMessage={errorMessage}
      onFileSelected={onFileSelected}
      onClearFile={onClearFile}
    />
  );
}
