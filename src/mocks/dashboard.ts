import {
  DashboardViewStateSchema,
  type DashboardViewState,
} from "@/lib/contracts/dashboard";
import type { DocumentSummary } from "@/lib/contracts/document";

export interface DashboardScenario {
  id: string;
  label: string;
  state: DashboardViewState;
}

/** Datos ficticios fijos. Los escenarios no son un motor de confirmaciones. */

const commercialDelivery: DocumentSummary = {
  id: "doc-comercial-001",
  title: "Entrega de maíz — Lote 14 (ficticio)",
  documentStatus: "listo_para_revision",
  controlStatus: "contradiccion_critica",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-03-10T14:30:00.000Z",
  warnings: [
    {
      id: "warn-entrega-cantidad",
      message:
        "Se declararon 10 toneladas entregadas, pero otro mensaje menciona 12 toneladas.",
      severity: "critical",
      sources: ["msg-0003", "msg-0007"],
    },
  ],
};

const measurementWithoutUnit: DocumentSummary = {
  id: "doc-medicion-001",
  title: "Medición de humedad — Silo 2 (ficticio)",
  documentStatus: "borrador",
  controlStatus: "con_advertencias",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-03-11T09:15:00.000Z",
  warnings: [
    {
      id: "warn-medicion-unidad",
      message: "Se registró una medición de 7 sin unidad indicada.",
      severity: "warning",
      sources: ["msg-0002"],
    },
  ],
};

const pendingConfirmations: DocumentSummary = {
  id: "doc-confirmaciones-001",
  title: "Venta de trigo — Contrato 22 (ficticio)",
  documentStatus: "esperando_confirmaciones",
  controlStatus: "sin_inconsistencias_criticas_detectadas",
  confirmationStatus: "parcial",
  hcsStatus: "no_iniciado",
  revisionId: "rev-confirmaciones-001-2",
  snapshotId: "snap-confirmaciones-001-2",
  updatedAt: "2026-03-12T16:45:00.000Z",
  warnings: [],
};

const finalizedHcsPending: DocumentSummary = {
  id: "doc-finalizado-pendiente-001",
  title: "Entrega de soja — Remito 87 (ficticio)",
  documentStatus: "finalizado",
  controlStatus: "con_advertencias",
  confirmationStatus: "completa",
  hcsStatus: "pendiente",
  revisionId: "rev-finalizado-pendiente-001-1",
  snapshotId: "snap-finalizado-pendiente-001-1",
  updatedAt: "2026-03-13T11:00:00.000Z",
  warnings: [
    {
      id: "warn-finalizado-fecha",
      message: "La fecha de entrega no fue informada; se conserva como dato ausente.",
      severity: "warning",
      sources: ["msg-0001"],
    },
  ],
};

const finalizedHcsRegistered: DocumentSummary = {
  id: "doc-finalizado-registrado-001",
  title: "Acuerdo de flete — Tramo 5 (ficticio)",
  documentStatus: "finalizado",
  controlStatus: "sin_inconsistencias_criticas_detectadas",
  confirmationStatus: "completa",
  hcsStatus: "registrado",
  revisionId: "rev-finalizado-registrado-001-1",
  snapshotId: "snap-finalizado-registrado-001-1",
  updatedAt: "2026-03-14T08:20:00.000Z",
  warnings: [],
};

const scenarios: DashboardScenario[] = [
  { id: "loading", label: "Cargando", state: { status: "loading" } },
  {
    id: "error",
    label: "Error técnico recuperable",
    state: {
      status: "error",
      message: "No se pudo cargar la lista de documentos. Intenta nuevamente.",
    },
  },
  {
    id: "empty",
    label: "Lista vacía",
    state: { status: "ready", documents: [] },
  },
  {
    id: "commercial",
    label: "Entrega comercial contradictoria (10 vs 12)",
    state: { status: "ready", documents: [commercialDelivery] },
  },
  {
    id: "measurement",
    label: "Medición sin unidad",
    state: { status: "ready", documents: [measurementWithoutUnit] },
  },
  {
    id: "confirmations",
    label: "Confirmaciones pendientes",
    state: { status: "ready", documents: [pendingConfirmations] },
  },
  {
    id: "finalized-pending",
    label: "Finalizada con sello HCS pendiente",
    state: { status: "ready", documents: [finalizedHcsPending] },
  },
  {
    id: "finalized-registered",
    label: "Finalizada con sello HCS registrado",
    state: { status: "ready", documents: [finalizedHcsRegistered] },
  },
];

export const dashboardScenarios: DashboardScenario[] = scenarios.map(
  (scenario) => ({
    ...scenario,
    state: DashboardViewStateSchema.parse(scenario.state),
  }),
);
