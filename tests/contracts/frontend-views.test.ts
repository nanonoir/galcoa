import { describe, expect, it } from "vitest";

import { AuthFormStateSchema } from "@/lib/contracts/auth-forms";
import { LandingContentSchema } from "@/lib/contracts/landing";
import { SnapshotViewStateSchema } from "@/lib/contracts/snapshot-view";
import { VersionHistoryViewStateSchema } from "@/lib/contracts/version-history-view";
import { authFormScenarios } from "@/mocks/auth";
import { snapshotScenarios, versionHistoryScenarios } from "@/mocks/documents";
import { landingScenarios } from "@/mocks/marketing";

const forbidden = /certificad|validado regulatoriamente|garantizado verdadero|firma digital|identidad verificada/i;

const find = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find((s) => s.id === id);
  if (!found) throw new Error(`Escenario ausente: ${id}`);
  return found;
};

describe("escenarios de vista: ids únicos y sin términos prohibidos", () => {
  it.each([
    ["snapshot", snapshotScenarios],
    ["historial", versionHistoryScenarios],
    ["landing", landingScenarios],
    ["acceso", authFormScenarios],
  ] as const)("%s", (_name, list) => {
    const ids = list.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(list)).not.toMatch(forbidden);
  });
});

describe("snapshot", () => {
  it("cubre los escenarios mínimos de frontend-delivery §2", () => {
    expect(snapshotScenarios.map((s) => s.id)).toEqual([
      "loading",
      "error",
      "empty",
      "critical-two-sources",
      "unit-missing",
      "no-warnings",
      "long-content",
    ]);
  });

  it("la contradicción crítica conserva dos fuentes como alias, no como ids", () => {
    const { state } = find(snapshotScenarios, "critical-two-sources");
    if (state.status !== "ready") throw new Error("ready esperado");
    expect(state.controlStatus).toBe("contradiccion_critica");
    expect(state.content.warnings[0].sources.map((s) => s.alias)).toEqual(["Fuente A", "Fuente B"]);
  });

  it("rechaza ids privados en fuentes, claves extra y selección no canónica", () => {
    const ready = find(snapshotScenarios, "no-warnings").state;
    if (ready.status !== "ready") throw new Error("ready esperado");
    expect(SnapshotViewStateSchema.safeParse({ ...ready, extra: 1 }).success).toBe(false);
    expect(SnapshotViewStateSchema.safeParse({ ...ready, content: { ...ready.content, selection: ["comprador", "autor"] } }).success).toBe(false);
    expect(SnapshotViewStateSchema.safeParse({ status: "ready" }).success).toBe(false);
    expect(
      SnapshotViewStateSchema.safeParse({
        ...ready,
        content: { ...ready.content, warnings: [{ id: "w", message: "m", severity: "warning", sources: ["msg-0003"] }] },
      }).success,
    ).toBe(false);
  });
});

describe("historial", () => {
  it("v1 conserva su sello y v2 enlaza a v1 con estados independientes", () => {
    const { state } = find(versionHistoryScenarios, "v1-registered-v2-pending");
    if (state.status !== "ready") throw new Error("ready esperado");
    expect(state.versions.map((v) => [v.number, v.previousVersionId, v.hcsStatus])).toEqual([
      [1, null, "registrado"],
      [2, "ver-soja-001-1", "pendiente"],
    ]);
  });

  it("no admite campos privados de la versión (PDF, manifiesto, hash)", () => {
    const ready = find(versionHistoryScenarios, "single-registered").state;
    if (ready.status !== "ready") throw new Error("ready esperado");
    const item = ready.versions[0];
    expect(VersionHistoryViewStateSchema.safeParse({ status: "ready", versions: [{ ...item, pdf: { location: "x" } }] }).success).toBe(false);
    expect(VersionHistoryViewStateSchema.safeParse({ status: "ready", versions: [{ ...item, number: 0 }] }).success).toBe(false);
  });

  it("la selección apunta a una versión existente cuando se informa", () => {
    for (const s of versionHistoryScenarios) {
      if (s.selectedVersionId === null) continue;
      if (s.state.status !== "ready") throw new Error("ready esperado");
      expect(s.state.versions.map((v) => v.versionId)).toContain(s.selectedVersionId);
    }
  });
});

describe("landing", () => {
  it("solo admite destinos internos o anclas", () => {
    const { content } = landingScenarios[0];
    for (const href of ["https://externo.example", "//externo.example", "javascript:alert(1)", "login"]) {
      expect(LandingContentSchema.safeParse({ ...content, primaryAction: { label: "x", href } }).success, href).toBe(false);
    }
  });

  it("no promete pagos, Mainnet ni envío automático", () => {
    expect(JSON.stringify(landingScenarios)).not.toMatch(/mainnet|pago|stripe|mercado/i);
  });
});

describe("formularios de acceso", () => {
  it("cubre los cuatro formularios", () => {
    expect(new Set(authFormScenarios.map((s) => s.form))).toEqual(new Set(["login", "register", "recovery_request", "new_password"]));
  });

  it("un error exige mensaje global o error de campo", () => {
    expect(AuthFormStateSchema.safeParse({ status: "error", message: null, fieldErrors: [] }).success).toBe(false);
    expect(AuthFormStateSchema.safeParse({ status: "error", message: "x", fieldErrors: [] }).success).toBe(true);
  });

  it("los resultados de recuperación y registro no revelan si la cuenta existe", () => {
    for (const s of authFormScenarios.filter((x) => x.id === "recovery-success" || x.id === "register-success")) {
      expect(JSON.stringify(s.state)).toMatch(/si /i);
    }
    expect(JSON.stringify(authFormScenarios)).not.toMatch(/ya existe|no existe|ya está registrad/i);
  });
});
