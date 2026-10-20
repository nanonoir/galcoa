import type { ReactNode } from "react";

import { BrandLockup } from "@/components/ui/brand-lockup";
import type { LandingContent } from "@/lib/contracts/landing";

/**
 * Encabezado de la landing (MVP-114, REQ-02). Toda la información está en la
 * propia página, así que no hay atajos de navegación: solo la marca y, a la
 * derecha, la acción que reciba (p. ej. «Cerrar sesión» con sesión iniciada).
 * El componente no consulta sesión ni red; la acción llega ya resuelta.
 */

export interface SiteNavigationProps {
  brand: string;
  action?: ReactNode;
}

/** Arma las props del encabezado a partir del contenido de la landing. */
export function siteNavigationProps(content: LandingContent): SiteNavigationProps {
  return { brand: content.brand };
}

export function SiteNavigation({ brand, action }: SiteNavigationProps) {
  return (
    <header className="surface-inverse h-16 border-b">
      <div className="mx-auto flex h-full w-full max-w-6xl items-stretch justify-between gap-4 pl-4">
        <div className="flex items-center gap-4">
          <BrandLockup label={brand} />
          <span aria-hidden="true" className="tech-label hidden xl:inline">Testnet</span>
        </div>
        {action}
      </div>
    </header>
  );
}
