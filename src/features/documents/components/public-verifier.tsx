"use client";

import { CheckCircle2, CircleHelp, FileUp, Info, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HcsStatus } from "@/lib/contracts/document";
import type { PublicVerification } from "@/lib/contracts/public";
import { cn } from "@/lib/utils";

/**
 * Presentación pura del verificador público (MVP-101; PRD REQ-11, INV-15, SH-02).
 * Muestra el estado del registro y la prueba solo si existen, y ofrece elegir un
 * PDF. Sin red, SDK ni entorno: el servidor decide; la validación de tipo y
 * tamaño aquí es solo una ayuda. No confirma ni acepta invitaciones.
 */

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type PublicVerifierProps = {
  verification: PublicVerification;
  /** El contenedor está esperando la respuesta del servidor para el archivo elegido. */
  isVerifying?: boolean;
  /** Error de la última verificación (p. ej. fallo de red); no sustituye al resultado. */
  errorMessage?: string | null;
  onFileSelected: (file: File) => void;
  /** Vuelve al estado sin archivo. */
  onClearFile?: () => void;
};

const registrationLabels: Record<HcsStatus, string> = {
  no_iniciado: "Registro no iniciado",
  pendiente: "Registro pendiente",
  registrado: "Registrado en Testnet",
  fallido: "Registro fallido",
};

type FileState = "sin_archivo" | "verificando" | "coincide" | "no_coincide" | "no_verificable";

type ResultCopy = { title: string; body: string; icon: typeof Info; tone: string };

const resultCopy: Record<Exclude<FileState, "sin_archivo" | "verificando">, ResultCopy> = {
  coincide: {
    title: "El archivo coincide con el registro",
    body: "Los bytes del PDF coinciden con la huella registrada.",
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-400",
  },
  no_coincide: {
    title: "El archivo no coincide con el registro",
    body: "Los bytes del PDF difieren de la huella registrada. Puede tratarse de otro archivo o de una copia modificada.",
    icon: XCircle,
    tone: "text-destructive",
  },
  no_verificable: {
    title: "No se pudo verificar el archivo",
    body: "Falta algún eslabón para comparar (por ejemplo, el registro está pendiente o no se pudo consultar). Esto no indica que el archivo sea distinto.",
    icon: CircleHelp,
    tone: "text-amber-700 dark:text-amber-400",
  },
};

function fileState(verification: PublicVerification, isVerifying: boolean): FileState {
  if (isVerifying) return "verificando";
  return verification.fileCheck.provided ? verification.fileCheck.result : "sin_archivo";
}

function rejectionMessage(rejections: FileRejection[]): string {
  if (rejections.length > 1) return "Elige un solo archivo PDF.";
  const codes = rejections[0]?.errors.map((e) => e.code) ?? [];
  if (codes.includes("file-too-large")) return "El archivo supera el máximo de 10 MiB.";
  if (codes.includes("file-invalid-type")) return "El archivo debe ser un PDF.";
  return "No se pudo usar ese archivo.";
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

function ProofRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-mono text-sm break-all">{value}</dd>
    </div>
  );
}

export function PublicVerifier({ verification, isVerifying = false, errorMessage, onFileSelected, onClearFile }: PublicVerifierProps) {
  const [selected, setSelected] = useState<{ name: string; size: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const state = fileState(verification, isVerifying);
  const { proof } = verification;

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_PDF_BYTES,
    multiple: false,
    disabled: isVerifying,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => {
      const [file] = files;
      if (!file) return;
      setLocalError(null);
      setSelected({ name: file.name, size: file.size });
      onFileSelected(file);
    },
    onDropRejected: (rejections) => setLocalError(rejectionMessage(rejections)),
  });

  const clear = () => {
    setSelected(null);
    setLocalError(null);
    onClearFile?.();
  };
  const result = state === "sin_archivo" || state === "verificando" ? null : resultCopy[state];
  const error = localError ?? errorMessage ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Verificación pública
            <Badge variant={verification.registrationStatus === "registrado" ? "default" : "secondary"}>
              {registrationLabels[verification.registrationStatus]}
            </Badge>
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Referencia: <span className="font-mono break-all">{verification.publicReference}</span>
          </p>
        </CardHeader>
        <CardContent>
          {proof ? (
            <dl className="flex flex-col gap-3" aria-label="Prueba del registro">
              <ProofRow label="Huella del manifiesto" value={proof.manifestHash} />
              <ProofRow label="Huella del PDF registrada" value={proof.envelope.pdfHash} />
              <ProofRow label="Topic" value={proof.consensus.topicId} />
              <ProofRow label="Secuencia" value={proof.consensus.sequenceNumber} />
              <ProofRow label="Consenso" value={proof.consensus.consensusTimestamp} />
              <ProofRow label="Red" value="Testnet" />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no hay una prueba de registro para mostrar. Sin ella no es posible comparar un archivo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comparar un PDF con el registro</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            {...getRootProps({
              className: cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                isDragActive && "border-primary bg-muted",
                isVerifying && "opacity-60",
              ),
            })}
          >
            <input {...getInputProps({ "aria-label": "Archivo PDF a comparar" })} />
            <FileUp aria-hidden className="text-muted-foreground size-8" />
            <p className="text-sm">{isDragActive ? "Suelta el PDF aquí" : "Arrastra un PDF aquí o elígelo desde tu dispositivo"}</p>
            <p className="text-muted-foreground text-xs">Un archivo PDF, hasta 10 MiB. El servidor hace la comprobación definitiva.</p>
            <Button type="button" variant="outline" onClick={open} disabled={isVerifying}>
              Elegir PDF
            </Button>
          </div>

          {selected ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="break-all">
                {selected.name} ({formatSize(selected.size)})
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isVerifying}>
                Quitar archivo
              </Button>
            </div>
          ) : null}

          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            {state === "sin_archivo" && !selected ? (
              <p className="text-muted-foreground text-sm">Aún no se ha elegido ningún archivo: solo se informa el estado del registro.</p>
            ) : null}
            {state === "verificando" ? (
              <p className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Verificando el archivo…
              </p>
            ) : null}
            {result ? (
              <div className="flex gap-3">
                <result.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", result.tone)} />
                <div>
                  <p className="font-medium">{result.title}</p>
                  <p className="text-muted-foreground text-sm">{result.body}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div aria-live="assertive">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo completar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Alert role="note">
        <Info aria-hidden />
        <AlertTitle>Alcance de esta comprobación</AlertTitle>
        <AlertDescription>
          Solo se compara la integridad técnica del archivo con la huella registrada. No acredita que los hechos descritos sean verdaderos ni
          confirma la identidad de quienes participaron. El archivo se procesa en el servidor sin conservarse. Hedera Testnet es una red de
          pruebas que puede reiniciarse y no ofrece permanencia de producción.
        </AlertDescription>
      </Alert>
    </div>
  );
}
