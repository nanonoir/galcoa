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
    { label: "Alcance", href: "#alcance" },
    { label: "Ingresar", href: "/login" },
  ],
  primaryAction: { label: "Crear cuenta", href: "/registro" },
  heading: "Documenta operaciones conversando",
  summary:
    "Cuenta la operación por chat, revisa el documento, pide la confirmación de las partes mediante enlaces y guarda la huella del resultado en Hedera Testnet.",
  features: [
    {
      title: "Conversación y evidencias",
      description: "Aportas mensajes y archivos; el sistema redacta un borrador y señala dudas sin bloquearte.",
    },
    {
      title: "Confirmación de las partes",
      description: "Cada persona seleccionada revisa el mismo contenido y confirma mediante un enlace.",
    },
    {
      title: "Sello de huella",
      description: "Al finalizar se registra solo la huella del documento en Testnet; el contenido no se publica.",
    },
  ],
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
        { label: "Alcance", href: "#alcance" },
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
