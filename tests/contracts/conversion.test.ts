import { describe, expect, it } from "vitest";

import { toActivationChecklist } from "@/features/conversion/containers/activation";
import { demoMessage, demoRemitoText, evaluateDemo, parseDemoQuantity, sha256Hex } from "@/features/demo/containers/demo-scenario";
import { FunnelEventSchema, PLANS, SubscriptionRequestSchema } from "@/lib/contracts/conversion";
import type { DocumentSummary } from "@/lib/contracts/document";

const visitorId = "0f8b6c4e-3a0d-4b9e-9c3e-2f1a7d5b8c90";

async function verdictFor(quantity: string, remito: "coincide" | "diferencia" | "sin_remito") {
  const message = demoMessage(quantity);
  const remitoText = demoRemitoText(quantity, remito);
  return evaluateDemo({
    quantity,
    message,
    messageHash: await sha256Hex(message),
    remitoText,
    remitoHash: remitoText ? await sha256Hex(remitoText) : null,
  });
}

describe("demo pública: corre el motor de reglas real (conversion-funnel.md, D1)", () => {
  it("200 y remito 200: verde y se puede sellar", async () => {
    expect(await verdictFor("200", "coincide")).toEqual({
      color: "verde",
      reasons: ["La cantidad de tu mensaje coincide con la del remito."],
      sealable: true,
    });
  });

  it("200 y remito 198 (regla 200/198): rojo, nunca se sella", async () => {
    const verdict = await verdictFor("200", "diferencia");
    expect(demoRemitoText("200", "diferencia")).toContain("198 cajas");
    expect(verdict?.color).toBe("rojo");
    expect(verdict?.sealable).toBe(false);
  });

  it("sin remito: amarillo (declarado), se puede sellar marcado como declarado", async () => {
    const verdict = await verdictFor("150", "sin_remito");
    expect(verdict?.color).toBe("amarillo");
    expect(verdict?.sealable).toBe(true);
  });

  it("solo acepta enteros entre 1 y 9999, sin separadores", () => {
    expect(parseDemoQuantity(" 200 ")).toBe("200");
    expect(parseDemoQuantity("007")).toBe("7");
    for (const bad of ["0", "10000", "1.000", "1,5", "-3", "", "abc"]) expect(parseDemoQuantity(bad)).toBeNull();
  });

  it("la huella es SHA-256 hexadecimal", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("contratos de conversión", () => {
  it("planes de prueba de las reglas de producto §9", () => {
    expect(PLANS.map((p) => [p.id, p.priceUsdMonthly, p.documentsPerMonth])).toEqual([
      ["inicial", 30, 150],
      ["crecimiento", 60, 600],
      ["pro", 120, 3000],
    ]);
  });

  it("eventos del embudo: lista cerrada y etiquetas cortas sin datos personales", () => {
    const ok = { event: "demo_started", visitorId, step: null, source: null, plan: null };
    expect(FunnelEventSchema.safeParse(ok).success).toBe(true);
    expect(FunnelEventSchema.safeParse({ ...ok, event: "otra_cosa" }).success).toBe(false);
    expect(FunnelEventSchema.safeParse({ ...ok, source: "juan@correo.com" }).success).toBe(false);
    expect(FunnelEventSchema.safeParse({ ...ok, visitorId: "no-es-uuid" }).success).toBe(false);
    expect(FunnelEventSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it("la solicitud de plan exige plan conocido y clave de idempotencia", () => {
    expect(SubscriptionRequestSchema.safeParse({ plan: "pro", idempotencyKey: visitorId }).success).toBe(true);
    expect(SubscriptionRequestSchema.safeParse({ plan: "gratis", idempotencyKey: visitorId }).success).toBe(false);
    expect(SubscriptionRequestSchema.safeParse({ plan: "pro" }).success).toBe(false);
  });
});

describe("activación derivada de los documentos reales (D4)", () => {
  const base: DocumentSummary = {
    id: "doc-1",
    title: "Entrega",
    documentStatus: "borrador",
    controlStatus: "sin_evaluar",
    confirmationStatus: null,
    hcsStatus: "no_iniciado",
    revisionId: null,
    snapshotId: null,
    updatedAt: "2026-10-22T10:00:00Z",
    warnings: [],
  };
  const done = (docs: DocumentSummary[]) => toActivationChecklist(docs).steps.filter((s) => s.done).map((s) => s.id);

  it("sin documentos: nada hecho y sin documento para seguir", () => {
    expect(toActivationChecklist([])).toEqual({
      steps: [
        { id: "creado", done: false },
        { id: "verificado", done: false },
        { id: "confirmado", done: false },
        { id: "sellado", done: false },
      ],
      nextDocumentId: null,
    });
  });

  it("avanza con el estado real de cada documento", () => {
    expect(done([base])).toEqual(["creado"]);
    expect(done([{ ...base, documentStatus: "esperando_confirmaciones", revisionId: "r1" }])).toEqual(["creado", "verificado"]);
    expect(done([{ ...base, documentStatus: "finalizado", revisionId: "r1", confirmationStatus: "completa" }])).toEqual(["creado", "verificado", "confirmado"]);
    expect(done([{ ...base, documentStatus: "finalizado", revisionId: "r1", confirmationStatus: "completa", hcsStatus: "registrado" }])).toEqual([
      "creado",
      "verificado",
      "confirmado",
      "sellado",
    ]);
  });

  it("una entrega completa cierra la activación aunque existan borradores recientes", () => {
    const docs = [
      { ...base, id: "viejo", updatedAt: "2026-10-20T10:00:00Z" },
      { ...base, id: "sellado", documentStatus: "finalizado" as const, revisionId: "r1", confirmationStatus: "completa" as const, hcsStatus: "registrado" as const, updatedAt: "2026-10-22T12:00:00Z" },
      { ...base, id: "reciente", updatedAt: "2026-10-21T10:00:00Z" },
    ];
    expect(toActivationChecklist(docs).nextDocumentId).toBeNull();
    expect(done(docs)).toEqual(["creado", "verificado", "confirmado", "sellado"]);
  });
});
