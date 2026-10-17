import { SnapshotViewStateSchema, type SnapshotViewState } from "@/lib/contracts/snapshot-view";
import {
  VersionHistoryViewStateSchema,
  type VersionHistoryViewState,
} from "@/lib/contracts/version-history-view";

/** Datos ficticios fijos para snapshot (MVP-112) e historial (MVP-113). */

export interface SnapshotScenario {
  id: string;
  label: string;
  state: SnapshotViewState;
}

export interface VersionHistoryScenario {
  id: string;
  label: string;
  state: VersionHistoryViewState;
  selectedVersionId: string | null;
}

const longBody = Array.from(
  { length: 8 },
  (_, i) =>
    `Cláusula ${i + 1}: las partes dejan constancia de que la entrega del lote se realizó en el depósito acordado, con carga y descarga a cargo del transportista, sin otras condiciones adicionales a las ya informadas por chat.`,
).join("\n\n");

const scenarios: SnapshotScenario[] = [
  { id: "loading", label: "Cargando", state: { status: "loading" } },
  {
    id: "error",
    label: "Error técnico recuperable",
    state: { status: "error", message: "No se pudo cargar la revisión. Intenta nuevamente." },
  },
  { id: "empty", label: "Sin revisión congelada", state: { status: "empty" } },
  {
    id: "critical-two-sources",
    label: "Contradicción crítica con dos fuentes (10 vs 12)",
    state: {
      status: "ready",
      revisionId: "rev-comercial-001-1",
      snapshotId: "snap-comercial-001-1",
      documentStatus: "esperando_confirmaciones",
      controlStatus: "contradiccion_critica",
      confirmationStatus: "parcial",
      hcsStatus: "no_iniciado",
      content: {
        operation: {
          title: "Entrega de maíz — Lote 14 (ficticio)",
          body: "El autor informa la entrega del Lote 14 al comprador. El chat declara 10 toneladas y el remito aportado indica 12 toneladas; el documento conserva ambas cifras sin elegir una.",
          corrections: [],
        },
        warnings: [
          {
            id: "warn-entrega-cantidad",
            message: "Se declararon 10 toneladas entregadas, pero otra fuente menciona 12 toneladas.",
            severity: "critical",
            sources: [
              { alias: "Fuente A", description: "mensaje del autor: 10 toneladas" },
              { alias: "Fuente B", description: "remito aportado: 12 toneladas" },
            ],
          },
        ],
        selection: ["autor", "comprador"],
      },
    },
  },
  {
    id: "unit-missing",
    label: "Medición sin unidad",
    state: {
      status: "ready",
      revisionId: "rev-medicion-001-1",
      snapshotId: "snap-medicion-001-1",
      documentStatus: "esperando_confirmaciones",
      controlStatus: "con_advertencias",
      confirmationStatus: "pendiente",
      hcsStatus: "no_iniciado",
      content: {
        operation: {
          title: "Medición de humedad — Silo 2 (ficticio)",
          body: "Se registró una medición de humedad de 7 en el Silo 2. La unidad no fue informada y se conserva como dato ausente.",
          corrections: ["Se corrigió «humedd» por «humedad»."],
        },
        warnings: [
          {
            id: "warn-medicion-unidad",
            message: "Se registró una medición de 7 sin unidad indicada.",
            severity: "warning",
            sources: [{ alias: "Fuente A", description: "mensaje del autor: «humedad 7»" }],
          },
        ],
        selection: ["autor"],
      },
    },
  },
  {
    id: "no-warnings",
    label: "Sin advertencias",
    state: {
      status: "ready",
      revisionId: "rev-flete-001-1",
      snapshotId: "snap-flete-001-1",
      documentStatus: "esperando_confirmaciones",
      controlStatus: "sin_inconsistencias_criticas_detectadas",
      confirmationStatus: "completa",
      hcsStatus: "no_iniciado",
      content: {
        operation: {
          title: "Acuerdo de flete — Tramo 5 (ficticio)",
          body: "El autor y el comprador acuerdan el flete del Tramo 5: 10 cajas, entrega el 2026-03-14, destinatario Comprador A.",
          corrections: [],
        },
        warnings: [],
        selection: ["autor", "intermediario", "comprador"],
      },
    },
  },
  {
    id: "long-content",
    label: "Contenido extenso",
    state: {
      status: "ready",
      revisionId: "rev-extenso-001-3",
      snapshotId: "snap-extenso-001-3",
      documentStatus: "esperando_confirmaciones",
      controlStatus: "con_advertencias",
      confirmationStatus: "parcial",
      hcsStatus: "no_iniciado",
      content: {
        operation: { title: "Entrega de soja — Remito 87 (ficticio)", body: longBody, corrections: [] },
        warnings: [
          {
            id: "warn-extenso-fecha",
            message: "La fecha de entrega no fue informada; se conserva como dato ausente.",
            severity: "warning",
            sources: [{ alias: "Fuente A", description: "mensaje del autor sin fecha" }],
          },
        ],
        selection: ["autor", "intermediario"],
      },
    },
  },
];

export const snapshotScenarios: SnapshotScenario[] = scenarios.map((s) => ({
  ...s,
  state: SnapshotViewStateSchema.parse(s.state),
}));

const historyScenarios: VersionHistoryScenario[] = [
  { id: "loading", label: "Cargando", state: { status: "loading" }, selectedVersionId: null },
  {
    id: "error",
    label: "Error técnico recuperable",
    state: { status: "error", message: "No se pudo cargar el historial. Intenta nuevamente." },
    selectedVersionId: null,
  },
  { id: "empty", label: "Sin versiones finalizadas", state: { status: "ready", versions: [] }, selectedVersionId: null },
  {
    id: "single-registered",
    label: "Una versión con sello registrado",
    state: {
      status: "ready",
      versions: [
        {
          versionId: "ver-flete-001-1",
          number: 1,
          previousVersionId: null,
          revisionId: "rev-flete-001-1",
          snapshotId: "snap-flete-001-1",
          finalizedAt: "2026-03-14T08:20:00.000Z",
          hcsStatus: "registrado",
        },
      ],
    },
    selectedVersionId: "ver-flete-001-1",
  },
  {
    id: "v1-registered-v2-pending",
    label: "v1 registrada y v2 con sello pendiente",
    state: {
      status: "ready",
      versions: [
        {
          versionId: "ver-soja-001-1",
          number: 1,
          previousVersionId: null,
          revisionId: "rev-soja-001-1",
          snapshotId: "snap-soja-001-1",
          finalizedAt: "2026-03-13T11:00:00.000Z",
          hcsStatus: "registrado",
        },
        {
          versionId: "ver-soja-001-2",
          number: 2,
          previousVersionId: "ver-soja-001-1",
          revisionId: "rev-soja-001-2",
          snapshotId: "snap-soja-001-2",
          finalizedAt: "2026-03-15T17:40:00.000Z",
          hcsStatus: "pendiente",
        },
      ],
    },
    selectedVersionId: "ver-soja-001-2",
  },
  {
    id: "seal-failed",
    label: "Sello fallido (versión finalizada)",
    state: {
      status: "ready",
      versions: [
        {
          versionId: "ver-trigo-001-1",
          number: 1,
          previousVersionId: null,
          revisionId: "rev-trigo-001-1",
          snapshotId: "snap-trigo-001-1",
          finalizedAt: "2026-03-16T10:05:00.000Z",
          hcsStatus: "fallido",
        },
      ],
    },
    selectedVersionId: null,
  },
];

export const versionHistoryScenarios: VersionHistoryScenario[] = historyScenarios.map((s) => ({
  ...s,
  state: VersionHistoryViewStateSchema.parse(s.state),
}));
