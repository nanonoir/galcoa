import { z } from "zod";

/**
 * Contratos del flujo de conversión (docs/exec-plans/active/conversion-funnel.md).
 * Planes de prueba según docs/GALCOA-REGLAS-PRODUCTO.md §9: se informan en USD y
 * se ajustan con el piloto; no hay cobro automático en P0 (AGENTS.md).
 */

export const PLAN_IDS = ["inicial", "crecimiento", "pro"] as const;
export const PlanIdSchema = z.enum(PLAN_IDS);
export type PlanId = z.infer<typeof PlanIdSchema>;

export const PlanSchema = z.strictObject({
  id: PlanIdSchema,
  name: z.string().min(1),
  priceUsdMonthly: z.number().int().positive(),
  documentsPerMonth: z.number().int().positive(),
  features: z.array(z.string().min(1)).min(1),
  highlighted: z.boolean(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PLANS: readonly Plan[] = [
  {
    id: "inicial",
    name: "Inicial",
    priceUsdMonthly: 30,
    documentsPerMonth: 150,
    features: ["Hasta 150 documentos por mes", "Confirmaciones del comercio por enlace o QR", "Huella en Hedera Testnet e historial"],
    highlighted: false,
  },
  {
    id: "crecimiento",
    name: "Crecimiento",
    priceUsdMonthly: 60,
    documentsPerMonth: 600,
    features: ["Hasta 600 documentos por mes", "Todo lo del plan Inicial", "Perfil comercial e indicadores para marcas (próximamente)"],
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    priceUsdMonthly: 120,
    documentsPerMonth: 3000,
    features: ["Hasta 3.000 documentos por mes", "Todo lo del plan Crecimiento", "Reportes e integraciones (próximamente)"],
    highlighted: false,
  },
].map((plan) => PlanSchema.parse(plan));

/** Etapas del embudo. Lista cerrada: el servidor rechaza cualquier otro nombre. */
export const FUNNEL_EVENTS = [
  "landing_viewed",
  "cta_clicked",
  "demo_started",
  "demo_step_viewed",
  "demo_verdict_shown",
  "demo_completed",
  "signup_viewed",
  "signup_completed",
  "activation_step_completed",
  "pricing_viewed",
  "plan_selected",
  "subscription_requested",
] as const;
export const FunnelEventNameSchema = z.enum(FUNNEL_EVENTS);
export type FunnelEventName = z.infer<typeof FunnelEventNameSchema>;

/** Etiqueta corta sin datos personales (paso, origen o color). */
const FunnelLabelSchema = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const FunnelEventSchema = z.strictObject({
  event: FunnelEventNameSchema,
  /** Identificador aleatorio del navegador (UUID), seudónimo: el servidor no lo vincula a cuentas. */
  visitorId: z.uuid(),
  step: FunnelLabelSchema.nullable(),
  source: FunnelLabelSchema.nullable(),
  plan: PlanIdSchema.nullable(),
});
export type FunnelEvent = z.infer<typeof FunnelEventSchema>;

export const SubscriptionRequestSchema = z.strictObject({
  plan: PlanIdSchema,
  /** Clave de idempotencia del navegador: repetir el envío no duplica la solicitud. */
  idempotencyKey: z.uuid(),
});
export type SubscriptionRequest = z.infer<typeof SubscriptionRequestSchema>;

export const SubscriptionRequestResultSchema = z.strictObject({
  status: z.enum(["solicitada", "ya_solicitada"]),
  plan: PlanIdSchema,
});
export type SubscriptionRequestResult = z.infer<typeof SubscriptionRequestResultSchema>;

/** Pasos de activación: del primer documento al primer sello. */
export const ACTIVATION_STEPS = ["creado", "verificado", "confirmado", "sellado"] as const;
export const ActivationStepIdSchema = z.enum(ACTIVATION_STEPS);
export type ActivationStepId = z.infer<typeof ActivationStepIdSchema>;

export const ActivationChecklistSchema = z.strictObject({
  steps: z.array(z.strictObject({ id: ActivationStepIdSchema, done: z.boolean() })).length(ACTIVATION_STEPS.length),
  /** Documento sobre el que conviene seguir (el más avanzado sin sellar), si existe. */
  nextDocumentId: z.string().min(1).nullable(),
});
export type ActivationChecklist = z.infer<typeof ActivationChecklistSchema>;

/** Orígenes admitidos para el contexto del registro (`/registro?origen=…`). */
export const SIGNUP_ORIGINS = ["demo", "precios", "landing"] as const;
export const SignupOriginSchema = z.enum(SIGNUP_ORIGINS);
export type SignupOrigin = z.infer<typeof SignupOriginSchema>;
