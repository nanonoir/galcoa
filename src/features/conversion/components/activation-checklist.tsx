import { Button, buttonVariants } from "@/components/ui/button";
import type { ActivationChecklist, ActivationStepId } from "@/lib/contracts/conversion";

/**
 * Guía de activación del panel (conversion-funnel.md, D4): del primer documento
 * al primer sello. Muestra el próximo paso concreto; al completar, invita a
 * elegir un plan sin bloquear el uso.
 */

const COPY: Record<ActivationStepId, { title: string; hint: string }> = {
  creado: { title: "Creá tu primer documento", hint: "Un documento por entrega." },
  verificado: { title: "Contá la entrega y revisá el documento", hint: "Escribí qué entregaste y adjuntá el remito; después tocá «Revisar»." },
  confirmado: { title: "Pedí la confirmación", hint: "Confirmá como proveedor y compartí el enlace o QR con el comprador (y con el transportista, si lo incluiste)." },
  sellado: { title: "Sellá la huella", hint: "Con todas las confirmaciones, «Finalizar y registrar huella» registra la huella en Hedera Testnet." },
};

export interface ActivationChecklistProps {
  checklist: ActivationChecklist;
  creating: boolean;
  error: string | null;
  pricingHref: string;
  onCreate: () => void;
  onContinue: (documentId: string) => void;
}

export function ActivationChecklistCard({ checklist, creating, error, pricingHref, onCreate, onContinue }: ActivationChecklistProps) {
  const completed = checklist.steps.filter((s) => s.done).length;
  const total = checklist.steps.length;
  const next = checklist.steps.find((s) => !s.done) ?? null;

  if (!next) {
    return (
      <section aria-labelledby="activacion-title" className="flex flex-col gap-3 border border-success p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="activacion-title" className="font-semibold">¡Sellaste tu primera entrega!</h2>
          <p className="text-sm text-muted-foreground">Cada entrega sellada suma a tu historial. Elegí el plan que acompañe tu volumen.</p>
        </div>
        <a href={pricingHref} className={buttonVariants({ className: "px-5" })}>
          Ver planes
        </a>
      </section>
    );
  }

  return (
    <section aria-labelledby="activacion-title" className="flex flex-col gap-4 border border-primary p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="activacion-title" className="text-lg font-semibold">Tu primera entrega sellada</h2>
        <p className="text-sm text-muted-foreground">
          {completed} de {total} pasos
        </p>
      </div>
      <progress className="h-1 w-full accent-primary" max={total} value={completed} aria-label={`${completed} de ${total} pasos completos`} />
      <ol className="grid gap-2 sm:grid-cols-4">
        {checklist.steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.id === next.id ? "step" : undefined}
            className={`flex flex-col gap-1 border p-3 text-sm ${step.id === next.id ? "border-primary bg-primary/10" : "border-border"} ${step.done ? "text-muted-foreground" : ""}`}
          >
            <span className="font-semibold">
              <span aria-hidden className="mr-1 font-mono text-xs">{step.done ? "✓" : index + 1}</span>
              {COPY[step.id].title}
              <span className="sr-only">{step.done ? " (hecho)" : " (pendiente)"}</span>
            </span>
            {step.id === next.id ? <span className="text-muted-foreground">{COPY[step.id].hint}</span> : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {next.id === "creado" || !checklist.nextDocumentId ? (
          <Button onClick={onCreate} disabled={creating}>
            {creating ? "Creando…" : "Crear mi primer documento"}
          </Button>
        ) : (
          <Button onClick={() => onContinue(checklist.nextDocumentId as string)}>Seguir con mi documento</Button>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
