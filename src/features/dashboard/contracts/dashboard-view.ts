import type { DashboardViewState } from "@/lib/contracts/dashboard";

/** Props de la presentación del dashboard: datos serializables y callbacks originados en cliente. */
export interface DashboardViewProps {
  state: DashboardViewState;
  onCreate: () => void;
  onOpen: (documentId: string) => void;
  onRetry: () => void;
}
