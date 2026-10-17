import type { ReactNode } from "react";

import type { LandingContent } from "@/lib/contracts/landing";

/** Props de la landing: copy y enlaces como datos, sin callbacks. */
export interface LandingViewProps {
  content: LandingContent;
  /** Acción del encabezado ya resuelta por la página (p. ej. «Cerrar sesión» con sesión iniciada). */
  headerAction?: ReactNode;
}
