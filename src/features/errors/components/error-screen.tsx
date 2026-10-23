import { AlertTriangle, FileQuestion, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Pantalla de error reutilizable (F-8 del plan de onboarding, P6). Solo presentación: las rutas de Next
 * (`not-found.tsx`, `error.tsx`, `global-error.tsx`) la montan y le pasan el código de referencia y `onRetry`.
 * Nunca muestra el mensaje ni la traza del error: solo un código corto para encontrarlo en los registros.
 */
export type ErrorScreenKind = "not-found" | "error" | "fatal";

export interface ErrorScreenProps {
  kind: ErrorScreenKind;
  /** Identificador opaco del error (p. ej. el `digest` de Next). Se descarta si no tiene forma de código. */
  reference?: string | null;
  /** Reintento (`reset()` de Next). Solo se ofrece en `error` y `fatal`. */
  onRetry?: () => void;
  /** Destino de «Ir a mis documentos». */
  documentsHref?: string;
  /** Destino de «Ir al inicio». */
  homeHref?: string;
}

const COPY: Record<ErrorScreenKind, { title: string; description: string }> = {
  "not-found": {
    title: "No encontramos esta página",
    description: "Puede que el enlace esté mal o que no tengas acceso a este documento.",
  },
  error: {
    title: "Algo falló al cargar",
    description: "Tus datos no se perdieron. Probá de nuevo; si sigue fallando, volvé a tus documentos.",
  },
  fatal: {
    title: "GALCOA+ no pudo abrirse",
    description: "Probá de nuevo en unos minutos.",
  },
};

/** Solo códigos cortos alfanuméricos: un mensaje de error o una traza nunca llegan a la pantalla. */
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function ErrorScreen({ kind, reference, onRetry, documentsHref = "/dashboard", homeHref = "/" }: ErrorScreenProps) {
  const { title, description } = COPY[kind];
  const safeReference = kind !== "not-found" && reference && REFERENCE_PATTERN.test(reference) ? reference : null;
  const Icon = kind === "not-found" ? FileQuestion : AlertTriangle;
  const canRetry = kind !== "not-found" && onRetry !== undefined;

  return (
    <section aria-labelledby="error-screen-title" className="mx-auto flex w-full max-w-prose flex-col items-center gap-4 px-4 py-12 text-center">
      <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
      <h1 id="error-screen-title" className="text-xl font-semibold break-words">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
        {canRetry && (
          <Button onClick={() => onRetry()} className="w-full sm:w-auto">
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            Reintentar
          </Button>
        )}
        {kind !== "fatal" && (
          <a href={documentsHref} className={buttonVariants({ variant: canRetry ? "outline" : "default", className: "w-full sm:w-auto" })}>
            Ir a mis documentos
          </a>
        )}
        {kind === "not-found" && (
          <a href={homeHref} className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
            Ir al inicio
          </a>
        )}
      </div>

      {safeReference && (
        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <p>Si el problema sigue, pasá este código:</p>
          {/* Línea propia: un código cortado a la mitad se copia mal. */}
          <code className="tech-id break-all">{safeReference}</code>
        </div>
      )}
    </section>
  );
}
