"use client";

import { z } from "zod";

import { FunnelEventSchema, type FunnelEventName, type PlanId } from "@/lib/contracts/conversion";

/**
 * Registro de etapas del embudo (conversion-funnel.md, D6). Sin terceros ni
 * datos personales: un identificador aleatorio por navegador y el nombre del
 * evento. Nunca rompe la experiencia: cualquier fallo se ignora. Respeta «Do
 * Not Track» y funciona aunque `localStorage` no esté disponible.
 */

const VISITOR_KEY = "galcoa.visitor";
const ONCE_PREFIX = "galcoa.once.";
export const FUNNEL_ENDPOINT = "/api/funnel";

let memoryVisitor: string | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function visitorId(): string {
  const store = storage();
  try {
    const saved = store?.getItem(VISITOR_KEY);
    if (saved && z.uuid().safeParse(saved).success) return saved;
  } catch {
    // Almacenamiento bloqueado: se usa un identificador de esta pestaña.
  }
  const id = memoryVisitor ?? crypto.randomUUID();
  memoryVisitor = id;
  try {
    store?.setItem(VISITOR_KEY, id);
  } catch {
    // Sin persistencia: el identificador vale para esta pestaña.
  }
  return id;
}

function doNotTrack(): boolean {
  return typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
}

/** Con «Do Not Track» no se conserva el identificador previo del navegador. */
function forgetVisitor(): void {
  memoryVisitor = null;
  try {
    storage()?.removeItem(VISITOR_KEY);
  } catch {
    // Almacenamiento bloqueado: no hay nada persistido que borrar.
  }
}

export interface TrackOptions {
  step?: string | null;
  source?: string | null;
  plan?: PlanId | null;
}

export function track(event: FunnelEventName, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  if (doNotTrack()) {
    forgetVisitor();
    return;
  }
  const parsed = FunnelEventSchema.safeParse({
    event,
    visitorId: visitorId(),
    step: options.step ?? null,
    source: options.source ?? null,
    plan: options.plan ?? null,
  });
  if (!parsed.success) return;
  try {
    void fetch(FUNNEL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify(parsed.data),
    }).catch(() => undefined);
  } catch {
    // La medición nunca interrumpe al usuario.
  }
}

/** Registra un evento una sola vez por navegador (p. ej. cada paso de activación). */
export function trackOnce(key: string, event: FunnelEventName, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  if (doNotTrack()) {
    forgetVisitor();
    return;
  }
  const store = storage();
  try {
    if (store?.getItem(ONCE_PREFIX + key)) return;
    store?.setItem(ONCE_PREFIX + key, "1");
  } catch {
    // Sin almacenamiento puede repetirse; el análisis cuenta visitantes distintos.
  }
  track(event, options);
}
