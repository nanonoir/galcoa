"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActivationChecklistCard } from "@/features/conversion/components/activation-checklist";
import { createDocument } from "@/features/dashboard/containers/create-document";
import { PlanIdSchema, type ActivationChecklist } from "@/lib/contracts/conversion";

import { trackOnce } from "./track";

/**
 * Container de la guía de activación (conversion-funnel.md, D4). Registra cada
 * paso cumplido una sola vez por navegador y recuerda el plan que el visitante
 * eligió antes de registrarse para sugerirlo al terminar.
 */

const LOGIN_PATH = "/acceso";
const CREATE_ERROR = "No se pudo crear el documento. Intentá nuevamente.";

function suggestedPlan(): string | null {
  try {
    const parsed = PlanIdSchema.safeParse(window.sessionStorage.getItem("galcoa.plan"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const noSubscription = () => () => undefined;

export function ActivationContainer({ checklist, userKey }: { checklist: ActivationChecklist; userKey: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lectura del navegador sin efecto: en el servidor no hay plan sugerido.
  const plan = useSyncExternalStore(noSubscription, suggestedPlan, () => null);
  const pricingHref = plan ? `/precios?plan=${plan}` : "/precios";
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    for (const step of checklist.steps) {
      if (step.done) trackOnce(`activacion.${userKey}.${step.id}`, "activation_step_completed", { step: step.id });
    }
  }, [checklist, userKey]);

  async function create() {
    idempotencyKey.current ??= crypto.randomUUID();
    setCreating(true);
    setError(null);
    const result = await createDocument(idempotencyKey.current);
    if (result.status === "unauthenticated") {
      router.replace(LOGIN_PATH);
      return;
    }
    if (result.status === "error") {
      setError(CREATE_ERROR);
      setCreating(false);
      return;
    }
    idempotencyKey.current = null;
    router.push(`/documents/${encodeURIComponent(result.id)}`);
  }

  return (
    <ActivationChecklistCard
      checklist={checklist}
      creating={creating}
      error={error}
      pricingHref={pricingHref}
      onCreate={() => void create()}
      onContinue={(id) => router.push(`/documents/${encodeURIComponent(id)}`)}
    />
  );
}
