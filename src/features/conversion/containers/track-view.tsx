"use client";

import { useEffect } from "react";

import type { FunnelEventName, PlanId } from "@/lib/contracts/conversion";

import { track } from "./track";

/** Marca la vista de una página del embudo desde un Server Component. No dibuja nada. */
export function TrackView({ event, source = null, plan = null }: { event: FunnelEventName; source?: string | null; plan?: PlanId | null }) {
  useEffect(() => {
    track(event, { source, plan });
  }, [event, source, plan]);
  return null;
}
