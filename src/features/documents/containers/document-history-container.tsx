"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { VersionHistory } from "@/features/documents/components/version-history";
import type { VersionHistoryViewState } from "@/lib/contracts/version-history-view";

/**
 * Container del historial (MVP-116/I3). La selección es estado local; el
 * reintento vuelve a pedir los datos al servidor. Muestra solo las versiones
 * persistidas que recibe: sin fixtures ni versiones simuladas.
 */
export function DocumentHistoryContainer({ state }: { state: VersionHistoryViewState }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  return <VersionHistory state={state} selectedVersionId={selected} onSelect={setSelected} onRetry={() => router.refresh()} />;
}
