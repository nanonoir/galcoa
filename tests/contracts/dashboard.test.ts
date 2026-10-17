import { describe, expect, it } from "vitest";

import { DashboardViewStateSchema } from "@/lib/contracts/dashboard";
import {
  DocumentSummarySchema,
  type DocumentSummary,
} from "@/lib/contracts/document";
import { dashboardScenarios } from "@/mocks/dashboard";

const validDoc: DocumentSummary = {
  id: "d1",
  title: "Doc",
  documentStatus: "borrador",
  controlStatus: "sin_evaluar",
  confirmationStatus: null,
  hcsStatus: "no_iniciado",
  revisionId: null,
  snapshotId: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  warnings: [],
};

function scenario(id: string) {
  const found = dashboardScenarios.find((s) => s.id === id);
  if (!found) throw new Error(`Escenario ausente: ${id}`);
  return found;
}

function docsOf(id: string): DocumentSummary[] {
  const { state } = scenario(id);
  if (state.status !== "ready") throw new Error("Se esperaba ready");
  return state.documents;
}

describe("DocumentSummarySchema", () => {
  it("acepta un resumen válido", () => {
    expect(DocumentSummarySchema.parse(validDoc)).toEqual(validDoc);
  });

  it.each([
    ["estado de documento desconocido", { documentStatus: "aprobado" }],
    ["estado de control desconocido", { controlStatus: "validado" }],
    ["estado HCS desconocido", { hcsStatus: "confirmado" }],
    ["confirmación desconocida", { confirmationStatus: "ok" }],
    ["fecha no ISO", { updatedAt: "10/03/2026" }],
    ["id vacío", { id: "" }],
    ["campo extra", { extra: true }],
    ["severidad desconocida", { warnings: [{ id: "w", message: "m", severity: "info", sources: [] }] }],
    ["advertencia sin fuentes", { warnings: [{ id: "w", message: "m", severity: "warning" }] }],
  ])("rechaza %s", (_name, patch) => {
    expect(DocumentSummarySchema.safeParse({ ...validDoc, ...patch }).success).toBe(false);
  });

  it("rechaza instancias Date en updatedAt", () => {
    expect(
      DocumentSummarySchema.safeParse({ ...validDoc, updatedAt: new Date() }).success,
    ).toBe(false);
  });
});

describe("DashboardViewStateSchema", () => {
  it("valida las tres variantes", () => {
    expect(DashboardViewStateSchema.safeParse({ status: "loading" }).success).toBe(true);
    expect(DashboardViewStateSchema.safeParse({ status: "error", message: "x" }).success).toBe(true);
    expect(
      DashboardViewStateSchema.safeParse({ status: "ready", documents: [validDoc] }).success,
    ).toBe(true);
  });

  it.each([
    ["status desconocido", { status: "idle" }],
    ["error sin mensaje", { status: "error" }],
    ["ready sin documents", { status: "ready" }],
    ["ready con documento inválido", { status: "ready", documents: [{ id: "x" }] }],
    ["loading con documents", { status: "loading", documents: [] }],
    ["null", null],
  ])("rechaza %s", (_name, value) => {
    expect(DashboardViewStateSchema.safeParse(value).success).toBe(false);
  });
});

describe("dashboardScenarios", () => {
  it("expone IDs estables en orden", () => {
    expect(dashboardScenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "commercial",
      "measurement",
      "confirmations",
      "finalized-pending",
      "finalized-registered",
    ]);
  });

  it("todos validan contra el schema y son DTO JSON", () => {
    for (const s of dashboardScenarios) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(DashboardViewStateSchema.safeParse(s.state).success).toBe(true);
      expect(JSON.parse(JSON.stringify(s.state))).toEqual(s.state);
    }
  });

  it("distingue carga y error de la lista vacía", () => {
    expect(scenario("loading").state.status).toBe("loading");
    expect(scenario("error").state.status).toBe("error");
    expect(docsOf("empty")).toEqual([]);
  });

  it("conserva la discrepancia comercial 10 vs 12 como advertencia crítica no bloqueante", () => {
    const [doc] = docsOf("commercial");
    const warning = doc.warnings.find((w) => w.severity === "critical");
    expect(warning?.message).toMatch(/10/);
    expect(warning?.message).toMatch(/12/);
    expect(warning?.sources.length).toBeGreaterThan(1);
    expect(doc.controlStatus).toBe("contradiccion_critica");
    // Crítica pero el documento sigue su flujo: no se convierte en estado bloqueado.
    expect(doc.documentStatus).toBe("listo_para_revision");
  });

  it("conserva la medición sin unidad como advertencia", () => {
    const [doc] = docsOf("measurement");
    expect(doc.warnings).toHaveLength(1);
    expect(doc.warnings[0].message).toMatch(/7/);
    expect(doc.warnings[0].message).toMatch(/sin unidad/);
  });

  it("muestra confirmaciones pendientes ligadas a revisión y snapshot", () => {
    const [doc] = docsOf("confirmations");
    expect(doc.documentStatus).toBe("esperando_confirmaciones");
    expect(doc.confirmationStatus).toBe("parcial");
    expect(doc.revisionId).not.toBeNull();
    expect(doc.snapshotId).not.toBeNull();
  });

  it("separa versión finalizada del sello HCS pendiente/registrado", () => {
    const [pending] = docsOf("finalized-pending");
    const [registered] = docsOf("finalized-registered");
    expect(pending.documentStatus).toBe("finalizado");
    expect(registered.documentStatus).toBe("finalizado");
    expect(pending.hcsStatus).toBe("pendiente");
    expect(registered.hcsStatus).toBe("registrado");
    expect(pending.confirmationStatus).toBe("completa");
    expect(pending.warnings[0].message).toContain("no fue informada");
  });

  it("las dimensiones no se confunden entre sí", () => {
    const all = dashboardScenarios.flatMap((s) =>
      s.state.status === "ready" ? s.state.documents : [],
    );
    // Control crítico con documento no finalizado; finalizado con control con advertencias.
    expect(all.some((d) => d.controlStatus === "contradiccion_critica" && d.documentStatus !== "finalizado")).toBe(true);
    expect(all.some((d) => d.documentStatus === "finalizado" && d.controlStatus === "con_advertencias")).toBe(true);
    // Mismo estado de documento con distinto sello HCS.
    const finalizedHcs = new Set(
      all.filter((d) => d.documentStatus === "finalizado").map((d) => d.hcsStatus),
    );
    expect(finalizedHcs).toEqual(new Set(["pendiente", "registrado"]));
  });

  it("usa IDs de documento únicos y fechas fijas", () => {
    const all = dashboardScenarios.flatMap((s) =>
      s.state.status === "ready" ? s.state.documents : [],
    );
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const d of all) expect(d.updatedAt).toMatch(/^2026-03-\d\dT.*Z$/);
  });
});
