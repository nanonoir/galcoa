import type { LandingContent } from "@/lib/contracts/landing";

/** Props de la landing y la navegación: enlaces como datos, sin callbacks (el menú móvil es estado visual local). */
export interface LandingViewProps {
  content: LandingContent;
}
