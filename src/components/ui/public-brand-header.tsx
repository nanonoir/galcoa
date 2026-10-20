import Link from "next/link";

import { BrandLockup } from "./brand-lockup";

/**
 * Cabecera mínima de marca para superficies públicas (confirmación y verificación).
 * Presentación pura: logo real (`.galcoa-brand`) y el contexto de red, sin sesión ni navegación
 * de la aplicación. El enlace al inicio no consume ni modifica nada de la página actual.
 */
export function PublicBrandHeader({ context }: { context: string }) {
  return (
    <header className="h-16 border-b">
      <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="GALCOA+, ir al inicio" className="inline-flex min-h-11 items-center outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
          <BrandLockup />
        </Link>
        <span className="tech-label text-right">{context}</span>
      </div>
    </header>
  );
}
