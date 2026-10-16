import type { VersionHistoryViewState } from "@/lib/contracts/version-history-view";

/** Props de la presentación del historial: la selección es una prop controlada por el container. */
export interface VersionHistoryViewProps {
  state: VersionHistoryViewState;
  /** `null` si no hay versión seleccionada. */
  selectedVersionId: string | null;
  onSelect: (versionId: string) => void;
  onRetry: () => void;
}
