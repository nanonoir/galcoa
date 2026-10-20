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

export function buildLandingContent(signedIn: boolean): LandingContent {
  const common = [
    { label: "Cómo funciona", href: "#como-funciona" },
  ];
  return LandingContentSchema.parse(
    signedIn
      ? {
          ...base,
          navigation: [...common, { label: "Mis documentos", href: "/dashboard" }],
          primaryAction: { label: "Ir a mis documentos", href: "/dashboard" },
        }
      : {
          ...base,
          navigation: [...common, { label: "Ingresar", href: "/acceso" }],
          primaryAction: { label: "Crear cuenta", href: "/registro" },
        },
  );
}
