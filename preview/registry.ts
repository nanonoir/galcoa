import type { ReactNode } from "react";
import { createElement } from "react";

import { DashboardReference } from "@/features/dashboard/components/dashboard-reference";
import type { DashboardViewProps } from "@/features/dashboard/contracts/dashboard-view";
import type { SnapshotViewProps } from "@/features/documents/contracts/snapshot-view";
import type { VersionHistoryViewProps } from "@/features/documents/contracts/version-history-view";
import type { LandingViewProps } from "@/features/marketing/contracts/landing-view";
import { authFormScenarios } from "@/mocks/auth";
import { dashboardScenarios } from "@/mocks/dashboard";
import { snapshotScenarios, versionHistoryScenarios } from "@/mocks/documents";
import { landingScenarios } from "@/mocks/marketing";

import { ScenarioPlaceholder } from "./scenario-placeholder";

/**
 * Registro del preview: lo mantiene el líder. Cada entrada se conecta a mano
 * (import explícito) a una presentación y a los escenarios de su contrato; no se
 * escanea el árbol. Los callbacks solo producen eventos locales de demostración.
 */

export interface LocalHandlers {
  onCreate: () => void;
  onOpen: (documentId: string) => void;
  onRetry: () => void;
  /** Registra un evento local arbitrario (callbacks de las entradas nuevas). */
  log: (message: string) => void;
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

/**
 * Entradas con `ScenarioPlaceholder`: preparan los escenarios para los
 * consumidores (MVP-112…115). Al implementarse cada presentación, su entrada
 * pasa a renderizarla; mientras tanto no cuentan como UI de producto.
 */
const snapshot: PreviewEntry = {
  id: "snapshot-placeholder",
  label: "Snapshot (placeholder, MVP-112)",
  scenarios: snapshotScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    const scenario = snapshotScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    const props: Pick<SnapshotViewProps, "state"> = { state: scenario.state };
    return createElement(ScenarioPlaceholder, {
      title: "Snapshot congelado",
      data: props,
      callbacks: [{ name: "onRetry()", run: handlers.onRetry }],
    });
  },
};

const versionHistory: PreviewEntry = {
  id: "version-history-placeholder",
  label: "Historial (placeholder, MVP-113)",
  scenarios: versionHistoryScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    const scenario = versionHistoryScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    const props: Pick<VersionHistoryViewProps, "state" | "selectedVersionId"> = {
      state: scenario.state,
      selectedVersionId: scenario.selectedVersionId,
    };
    const versions = scenario.state.status === "ready" ? scenario.state.versions : [];
    return createElement(ScenarioPlaceholder, {
      title: "Historial de versiones",
      data: props,
      callbacks: [
        { name: "onRetry()", run: handlers.onRetry },
        ...versions.map((v) => ({ name: `onSelect("${v.versionId}")`, run: () => handlers.log(`onSelect("${v.versionId}")`) })),
      ],
    });
  },
};

const landing: PreviewEntry = {
  id: "landing-placeholder",
  label: "Landing (placeholder, MVP-114)",
  scenarios: landingScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId) {
    const scenario = landingScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    const props: LandingViewProps = { content: scenario.content };
    return createElement(ScenarioPlaceholder, { title: "Landing y navegación", data: props });
  },
};

const authForms: PreviewEntry = {
  id: "auth-forms-placeholder",
  label: "Acceso (placeholder, MVP-115)",
  scenarios: authFormScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    const scenario = authFormScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    return createElement(ScenarioPlaceholder, {
      title: `Formulario ${scenario.form}`,
      data: { form: scenario.form, state: scenario.state },
      callbacks: [{ name: "onSubmit(valores)", run: () => handlers.log(`onSubmit(${scenario.form})`) }],
    });
  },
};

export const previewEntries: readonly PreviewEntry[] = [dashboard, snapshot, versionHistory, landing, authForms];
