import { useId } from "react";

import type { ParticipantSelection } from "@/lib/contracts/review";

/**
 * Selector de participantes de la revisión (MVP-077; REQ-12, INV-11; F-2).
 * El proveedor (vos) y el comprador son obligatorios; el transportista es opcional. Salen solo las dos selecciones
 * válidas, en orden canónico: proveedor + comprador, o proveedor + transportista + comprador. Con `locked` la selección
 * se muestra fija: cambiarla exige abrir otra revisión (no hereda confirmaciones). Solo props y callbacks.
 */

export interface ParticipantSelectorProps {
  value: ParticipantSelection;
  locked: boolean;
  /** Sugerencia de la IA: solo informa; el autor decide. */
  suggestion?: ParticipantSelection | null;
  onChange: (selection: ParticipantSelection) => void;
}

export function ParticipantSelector({ value, locked, suggestion = null, onChange }: ParticipantSelectorProps) {
  const hintId = useId();
  const withCarrier = (value as readonly string[]).includes("intermediario");
  const suggestedCarrier = (suggestion as readonly string[] | null)?.includes("intermediario") ?? false;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={hintId}>
      <legend className="text-base font-semibold">¿Quiénes van a confirmar esta operación?</legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        {locked
          ? "La selección quedó fija para esta revisión. Si la cambiás, se abre otra revisión y las confirmaciones anteriores no se heredan."
          : "Vos (proveedor) y el comprador siempre confirman. Podés sumar al transportista. Responden en orden: proveedor, transportista y comprador."}
      </p>

      <label className="flex min-h-11 items-center gap-3 border bg-muted/40 p-3 text-sm">
        <input type="checkbox" checked disabled aria-label="Proveedor (vos): siempre incluido" className="size-5 accent-success" />
        <span>Proveedor (vos) — siempre incluido</span>
      </label>

      <label className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border bg-card p-3 text-sm focus-within:ring-3 focus-within:ring-ring/50">
        <input
          type="checkbox"
          checked={withCarrier}
          disabled={locked}
          onChange={() => onChange(withCarrier ? ["autor", "comprador"] : ["autor", "intermediario", "comprador"])}
          className="size-5 accent-success"
        />
        <span>Transportista (opcional)</span>
        {suggestedCarrier && <span className="ml-auto text-xs text-muted-foreground">Sugerido por el asistente</span>}
      </label>

      <label className="flex min-h-11 items-center gap-3 border bg-muted/40 p-3 text-sm">
        <input type="checkbox" checked disabled aria-label="Comprador: siempre incluido" className="size-5 accent-success" />
        <span>Comprador — siempre incluido</span>
      </label>
    </fieldset>
  );
}
