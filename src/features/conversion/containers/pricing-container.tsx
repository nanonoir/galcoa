"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PricingPlans } from "@/features/conversion/components/pricing-plans";
import type { PlanRequestState } from "@/features/conversion/contracts/pricing-view";
import { PLANS, SubscriptionRequestResultSchema, type PlanId } from "@/lib/contracts/conversion";

import { track } from "./track";

/**
 * Container de planes (conversion-funnel.md, D5). Con sesión, «Contratar»
 * registra una solicitud real con `POST /api/subscriptions` (idempotente por
 * clave); sin sesión, lleva al registro con el plan elegido. Un fallo se
 * muestra como error, nunca como contratación simulada.
 */

export const SUBSCRIPTIONS_ENDPOINT = "/api/subscriptions";
const LOGIN_PATH = "/acceso";
const REQUEST_ERROR = "No pudimos registrar la solicitud. Probá de nuevo en unos minutos.";

export function pricingSignupHref(plan: PlanId): string {
  return `/registro?origen=precios&plan=${plan}`;
}

export function PricingContainer({ signedIn, suggestedPlan }: { signedIn: boolean; suggestedPlan: PlanId | null }) {
  const router = useRouter();
  const [request, setRequest] = useState<PlanRequestState>({ status: "idle" });
  const keys = useRef(new Map<PlanId, string>());

  useEffect(() => {
    track("pricing_viewed", { source: signedIn ? "con_sesion" : "visitante", plan: suggestedPlan });
  }, [signedIn, suggestedPlan]);

  async function requestPlan(plan: PlanId) {
    if (!keys.current.has(plan)) keys.current.set(plan, crypto.randomUUID());
    setRequest({ status: "submitting", plan });
    try {
      const response = await fetch(SUBSCRIPTIONS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ plan, idempotencyKey: keys.current.get(plan) }),
      });
      if (response.status === 401) {
        router.replace(`${LOGIN_PATH}`);
        return;
      }
      const parsed = SubscriptionRequestResultSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) throw new Error("request failed");
      setRequest({ status: "requested", plan, alreadyRequested: parsed.data.status === "ya_solicitada" });
      track("subscription_requested", { plan });
    } catch {
      setRequest({ status: "error", plan, message: REQUEST_ERROR });
    }
  }

  return (
    <PricingPlans
      plans={PLANS}
      signedIn={signedIn}
      suggestedPlan={suggestedPlan}
      request={request}
      signupHref={pricingSignupHref}
      onChoose={(plan) => {
        track("plan_selected", { plan, source: signedIn ? "con_sesion" : "visitante" });
        try {
          window.sessionStorage.setItem("galcoa.plan", plan);
        } catch {
          // Sin almacenamiento el plan viaja igual en la URL del registro.
        }
        if (signedIn) void requestPlan(plan);
      }}
    />
  );
}
