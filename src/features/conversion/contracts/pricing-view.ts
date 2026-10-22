import type { Plan, PlanId } from "@/lib/contracts/conversion";

/** Estado de la contratación de un plan (conversion-funnel.md, D5). */
export type PlanRequestState =
  | { status: "idle" }
  | { status: "submitting"; plan: PlanId }
  | { status: "requested"; plan: PlanId; alreadyRequested: boolean }
  | { status: "error"; plan: PlanId; message: string };

export interface PricingViewProps {
  plans: readonly Plan[];
  signedIn: boolean;
  /** Plan sugerido (p. ej. el que eligió antes de registrarse). */
  suggestedPlan: PlanId | null;
  request: PlanRequestState;
  /** Destino de registro para un visitante, por plan. */
  signupHref: (plan: PlanId) => string;
  onChoose: (plan: PlanId) => void;
}
