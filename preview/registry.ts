import type { ReactNode } from "react";
import { createElement, useState } from "react";

import { LoginForm } from "@/features/auth/components/login-form";
import { NewPasswordForm } from "@/features/auth/components/new-password-form";
import { RecoveryRequestForm } from "@/features/auth/components/recovery-request-form";
import { RegisterForm } from "@/features/auth/components/register-form";
import type {
  LoginFormProps,
  NewPasswordFormProps,
  RecoveryRequestFormProps,
  RegisterFormProps,
} from "@/features/auth/contracts/auth-forms";
import { DashboardReference } from "@/features/dashboard/components/dashboard-reference";
import type { DashboardViewProps } from "@/features/dashboard/contracts/dashboard-view";
import type { SnapshotViewProps } from "@/features/documents/contracts/snapshot-view";
import { VersionHistory } from "@/features/documents/components/version-history";
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
  label: "Dashboard (MVP-111)",
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

/** Historial (MVP-113): selección controlada por estado local del preview; los callbacks solo registran el evento. */
function VersionHistoryPreview({ scenarioId, handlers }: { scenarioId: string; handlers: LocalHandlers }) {
  const scenario = versionHistoryScenarios.find((s) => s.id === scenarioId);
  const [selected, setSelected] = useState({ scenarioId, versionId: scenario?.selectedVersionId ?? null });
  if (!scenario) return null;
  // Al cambiar de escenario vuelve a la selección inicial del fixture.
  const selectedVersionId = selected.scenarioId === scenarioId ? selected.versionId : scenario.selectedVersionId;
  const props: VersionHistoryViewProps = {
    state: scenario.state,
    selectedVersionId,
    onSelect: (versionId) => {
      setSelected({ scenarioId, versionId });
      handlers.log(`onSelect("${versionId}")`);
    },
    onRetry: handlers.onRetry,
  };
  return createElement(VersionHistory, props);
}

const versionHistory: PreviewEntry = {
  id: "version-history",
  label: "Historial (MVP-113)",
  scenarios: versionHistoryScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    if (!versionHistoryScenarios.some((s) => s.id === scenarioId)) return null;
    return createElement(VersionHistoryPreview, { scenarioId, handlers });
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

/** Acceso (MVP-115): elige el formulario por el discriminante `form`; el callback solo registra el nombre del evento, nunca valores. */
const authForms: PreviewEntry = {
  id: "auth-forms",
  label: "Acceso (MVP-115)",
  scenarios: authFormScenarios.map(({ id, label }) => ({ id, label })),
  render(scenarioId, handlers) {
    const scenario = authFormScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    const { state } = scenario;
    const onSubmit = () => handlers.log(`onSubmit(${scenario.form})`);
    switch (scenario.form) {
      case "login":
        return createElement(LoginForm, { state, onSubmit } satisfies LoginFormProps);
      case "register":
        return createElement(RegisterForm, { state, onSubmit } satisfies RegisterFormProps);
      case "recovery_request":
        return createElement(RecoveryRequestForm, { state, onSubmit } satisfies RecoveryRequestFormProps);
      case "new_password":
        return createElement(NewPasswordForm, { state, onSubmit } satisfies NewPasswordFormProps);
    }
  },
};

export const previewEntries: readonly PreviewEntry[] = [dashboard, snapshot, versionHistory, landing, authForms];
