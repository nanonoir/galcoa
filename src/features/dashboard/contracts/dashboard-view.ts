import type { DashboardViewState } from "@/lib/contracts/dashboard";

/** Props de la presentación del dashboard: datos serializables y callbacks originados en cliente. */
export interface DashboardViewProps {
  state: DashboardViewState;
  /** La guía de activación ya ofrece crear el primer documento: el vacío no repite pasos ni botón. */
  guideShown?: boolean;
  onCreate: () => void;
  onOpen: (documentId: string) => void;
  onRetry: () => void;
}
