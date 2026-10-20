import { LandingContentSchema, type LandingContent } from "@/lib/contracts/landing";

/** Copy ficticio de la landing (MVP-114): lenguaje del PRD §5 y §11, sin promesas fuera de P0. */

export interface LandingScenario {
  id: string;
  label: string;
  content: LandingContent;
}

const base: LandingContent = {
  brand: "GALCOA+",
  navigation: [
    { label: "Cómo funciona", href: "#como-funciona" },
    { label: "Ingresar", href: "/login" },
  ],
  primaryAction: { label: "Crear cuenta", href: "/registro" },
  heading: "Cada entrega cuenta. Hacé que también te respalde.",
  summary:
    "Registrá tus entregas por chat, reuní los comprobantes y pedile al comercio que confirme por enlace o QR. GALCOA+ te ayuda a respaldar cada operación y construir la reputación de tu distribuidora.",
  features: [
    {
      title: "Conversación y evidencias",
      description: "Aportás mensajes y archivos; el sistema redacta un borrador de la entrega.",
    },
    {
      title: "Confirmación del comercio",
      description: "El comercio revisa el mismo contenido y confirma mediante un enlace o QR.",
    },
    {
      title: "Sello de huella",
      description: "Al finalizar se registra solo la huella del documento en Testnet; el contenido no se publica.",
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
    "Es una demostración sobre Hedera Testnet.",
    "El registro no garantiza que los datos sean verdaderos.",
    "Los enlaces de confirmación se comparten manualmente.",
  ],
};

const scenarios: LandingScenario[] = [
  { id: "public", label: "Visitante", content: base },
  {
    id: "signed-in",
    label: "Con sesión",
    content: {
      ...base,
      navigation: [
        { label: "Cómo funciona", href: "#como-funciona" },
        { label: "Mis documentos", href: "/dashboard" },
      ],
      primaryAction: { label: "Ir a mis documentos", href: "/dashboard" },
    },
  },
];

export const landingScenarios: LandingScenario[] = scenarios.map((s) => ({
  ...s,
  content: LandingContentSchema.parse(s.content),
}));
