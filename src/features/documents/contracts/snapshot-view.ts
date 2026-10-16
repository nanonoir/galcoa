import type { SnapshotViewState } from "@/lib/contracts/snapshot-view";

/** Props de la presentación del snapshot (solo lectura): sin acciones de confirmar, rechazar ni finalizar. */
export interface SnapshotViewProps {
  state: SnapshotViewState;
  onRetry: () => void;
}
