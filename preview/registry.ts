import type { ReactNode } from "react";
import { createElement } from "react";

import { DashboardReference } from "@/features/dashboard/components/dashboard-reference";
import type { DashboardViewProps } from "@/features/dashboard/contracts/dashboard-view";
import { dashboardScenarios } from "@/mocks/dashboard";

/**
 * Registro del preview: lo mantiene el líder. Cada entrada se conecta a mano
 * (import explícito) a una presentación y a los escenarios de su contrato; no se
 * escanea el árbol. Los callbacks solo producen eventos locales de demostración.
 */

export interface LocalHandlers {
  onCreate: () => void;
  onOpen: (documentId: string) => void;
  onRetry: () => void;
}

export interface PreviewScenario {
  id: string;
  label: string;
}

export interface PreviewEntry {
  id: string;
  label: string;
  scenarios: readonly PreviewScenario[];
  render: (scenarioId: string, handlers: LocalHandlers) => ReactNode;
}

const dashboard: PreviewEntry = {
  id: "dashboard-reference",
  label: "Dashboard (referencia mínima)",
  scenarios: dashboardScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    const scenario = dashboardScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    const props: DashboardViewProps = { state: scenario.state, ...handlers };
    return createElement(DashboardReference, props);
  },
};

export const previewEntries: readonly PreviewEntry[] = [dashboard];
