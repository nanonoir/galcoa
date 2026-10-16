import { useId } from "react";

import type { ParticipantSelection, ThirdPartyRole } from "@/lib/contracts/review";

/**
 * Selector de participantes de la revisión (MVP-077; REQ-12, INV-11).
 * Siempre incluye al autor; sale exactamente una de las cuatro combinaciones
 * del PRD, en orden canónico. Con `locked` la selección se muestra fija: cambiarla
 * exige abrir otra revisión (no hereda confirmaciones). Solo props y callbacks.
 */

const THIRD_PARTIES: { role: ThirdPartyRole; label: string }[] = [
  { role: "intermediario", label: "Intermediario" },
  { role: "comprador", label: "Comprador" },
];

function toSelection(roles: ReadonlySet<ThirdPartyRole>): ParticipantSelection {
  const hasInter = roles.has("intermediario");
  const hasBuyer = roles.has("comprador");
  if (hasInter && hasBuyer) return ["autor", "intermediario", "comprador"];
  if (hasInter) return ["autor", "intermediario"];
  if (hasBuyer) return ["autor", "comprador"];
  return ["autor"];
}

export interface ParticipantSelectorProps {
  value: ParticipantSelection;
  locked: boolean;
  /** Sugerencia de la IA: solo informa; el autor decide. */
  suggestion?: ParticipantSelection | null;
  onChange: (selection: ParticipantSelection) => void;
}

export function ParticipantSelector({ value, locked, suggestion = null, onChange }: ParticipantSelectorProps) {
  const hintId = useId();
  const selected = new Set<ThirdPartyRole>(value.flatMap((role) => (role === "autor" ? [] : [role])));
  const suggestedRoles = suggestion?.filter((role) => role !== "autor") ?? [];

  function toggle(role: ThirdPartyRole) {
    const next = new Set<ThirdPartyRole>(selected);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    onChange(toSelection(next));
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={hintId}>
      <legend className="text-base font-semibold">¿Quiénes van a confirmar esta operación?</legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        {locked
          ? "La selección quedó fija para esta revisión. Si la cambiás, se abre otra revisión y las confirmaciones anteriores no se heredan."
          : "Vos siempre confirmás. Podés sumar al intermediario, al comprador o a ambos."}
      </p>

      <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
        <input type="checkbox" checked disabled aria-label="Autor (vos): siempre incluido" className="size-4" />
        <span>Autor (vos) · siempre incluido</span>
      </label>

      {THIRD_PARTIES.map(({ role, label }) => (
        <label key={role} className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-3 text-sm focus-within:ring-3 focus-within:ring-ring/50">
          <input type="checkbox" checked={selected.has(role)} disabled={locked} onChange={() => toggle(role)} className="size-4" />
          <span>{label}</span>
          {suggestedRoles.includes(role) && <span className="ml-auto text-xs text-muted-foreground">Sugerido por el asistente</span>}
        </label>
      ))}
    </fieldset>
  );
}
