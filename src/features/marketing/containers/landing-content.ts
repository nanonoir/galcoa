import { LandingContentSchema, type LandingContent } from "@/lib/contracts/landing";

/**
 * Contenido de la landing (MVP-116/I4; PRD REQ-02, §5, §11). Los destinos son
 * datos: con sesión verificada la acción principal lleva al panel; sin sesión,
 * al registro y al acceso. Lenguaje sin promesas fuera de P0 (Testnet, huella).
 */
const base = {
  brand: "GALCOA+",
  heading: "Registros con respaldo, rastro y control de calidad",
  summary:
    "Cuenta la operación por chat. La inteligencia artificial controla que esté completa y coincida con tus pruebas, las partes la confirman con un enlace y queda registrada de forma que cualquier cambio se nota.",
  features: [
    {
      title: "Control de calidad",
      description: "Compara lo pedido con lo recibido y te avisa lo que no coincide, sin frenarte el trabajo.",
    },
    {
      title: "Respaldo",
      description: "Una persona responsable confirma con su nombre y la otra parte revisa exactamente lo mismo mediante un enlace.",
    },
    {
      title: "Trazabilidad",
      description: "Al finalizar se guarda una huella del documento en un libro público; el contenido no se publica.",
    },
  ],
  limits: [
    "Es una demostración: usa una red de práctica (Hedera Testnet) y datos de ejemplo.",
    "El registro no garantiza que los datos sean verdaderos: deja constancia de quién los confirmó y de que no se cambiaron.",
    "Los enlaces de confirmación se comparten manualmente.",
  ],
};

export function buildLandingContent(signedIn: boolean): LandingContent {
  const common = [
    { label: "Cómo funciona", href: "#como-funciona" },
    { label: "Alcance", href: "#alcance" },
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
