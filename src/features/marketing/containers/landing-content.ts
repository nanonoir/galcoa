import { LandingContentSchema, type LandingContent } from "@/lib/contracts/landing";

/**
 * Contenido de la landing (MVP-116/I4; PRD REQ-02, §5, §11). Los destinos son
 * datos: con sesión verificada la acción principal lleva al panel; sin sesión,
 * al registro y al acceso. Lenguaje sin promesas fuera de P0 (Testnet, huella).
 */
const base = {
  brand: "GALCOA+",
  heading: "Cada entrega cuenta. Hacé que también te respalde.",
  summary:
    "Registrá tus entregas por chat, reuní los comprobantes y pedile al comercio que confirme por enlace o QR. GALCOA+ te ayuda a respaldar cada operación y construir la reputación de tu distribuidora.",
  features: [
    {
      title: "Control de calidad",
      description: "Ordena los datos de la entrega y los contrasta con tus comprobantes.",
    },
    {
      title: "Respaldo",
      description: "El comercio revisa y confirma la misma versión que revisaste, desde un enlace o QR y sin crear una cuenta.",
    },
    {
      title: "Trazabilidad",
      description:
        "Al finalizar, la huella del documento queda en Hedera Testnet y el contenido no se publica. Una copia modificada deja de coincidir con la huella: eso detecta cambios, no prueba que lo declarado sea verdadero.",
    },
  ],
  upcoming: {
    label: "Próximamente · Contratos inteligentes",
    title: "Cada meta cumplida, un beneficio acordado.",
    description:
      "Definí metas comerciales y pactá bonificaciones con tus clientes. Los contratos inteligentes vinculan las condiciones del acuerdo con operaciones confirmadas: qué se reconoce, cuándo corresponde y cómo se comprueba.",
    example: "100.000 unidades vendidas → USD 10.000 de bonificación acordada.",
    disclaimer:
      "Ejemplo ilustrativo sujeto a las condiciones entre las partes. No implica ganancias garantizadas ni pagos automáticos. Primera etapa sin custodia ni transferencia de fondos.",
  },
  limits: [
    "Es una demostración: usa una red de práctica (Hedera Testnet) y datos de ejemplo.",
    "El registro no garantiza que los datos sean verdaderos: deja constancia de quién los confirmó y de que no se cambiaron.",
    "Los enlaces de confirmación se comparten manualmente.",
  ],
};

/** Problema (reglas de producto §3): se cuenta antes de la solución para que el visitante se reconozca. */
const problem = {
  title: "Trabajás bien, pero ¿lo podés demostrar?",
  points: [
    "Remitos, planillas y mensajes de WhatsApp desparramados.",
    "Reclamos sin respaldo: cuando algo sale mal, nadie puede probar qué pasó.",
    "Todo queda en tu palabra, sin un tercero que lo confirme.",
  ],
};

/**
 * Embudo de conversión (docs/exec-plans/active/conversion-funnel.md, D2): sin
 * sesión, la acción principal es probar la demo sin registrarse y la secundaria
 * crear la cuenta; con sesión, ir al panel. «Planes» está siempre visible.
 */
export function buildLandingContent(signedIn: boolean): LandingContent {
  const common = [
    { label: "Cómo funciona", href: "#como-funciona" },
    { label: "Planes", href: "/precios" },
  ];
  const pricingTeaser = {
    text: "Abono mensual desde USD 30. Probá primero la demo; contratás cuando te convenza.",
    link: { label: "Ver planes", href: "/precios" },
  };
  return LandingContentSchema.parse(
    signedIn
      ? {
          ...base,
          problem,
          pricingTeaser,
          navigation: [...common, { label: "Mis documentos", href: "/dashboard" }],
          primaryAction: { label: "Ir a mis documentos", href: "/dashboard" },
          secondaryAction: { label: "Ver la demo", href: "/demo" },
        }
      : {
          ...base,
          problem,
          pricingTeaser,
          navigation: [...common, { label: "Demo", href: "/demo" }, { label: "Ingresar", href: "/acceso" }],
          primaryAction: { label: "Probar la demo sin registrarte", href: "/demo" },
          secondaryAction: { label: "Crear cuenta", href: "/registro?origen=landing" },
        },
  );
}
