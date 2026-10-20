import Link from "next/link";

import { BrandLockup } from "@/components/ui/brand-lockup";

/** Grupo público de acceso (MVP-031): sesión por cookies, nunca prerenderizado ni cacheado. */
export const dynamic = "force-dynamic";

/**
 * Composición de marca del acceso (solo presentación): encabezado con el logo
 * real alineado al ancho de la landing y, junto al formulario, el contexto del
 * producto y del alcance de la demostración. La lógica de Auth vive en los containers.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="surface-inverse h-16 border-b">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-4 px-4">
          <Link
            href="/"
            aria-label="GALCOA+, ir al inicio"
            className="inline-flex min-h-11 items-center outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BrandLockup />
          </Link>
          <span aria-hidden="true" className="tech-label hidden xl:inline">
            Testnet
          </span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-10 px-4 py-10 md:py-16 lg:grid-cols-12 lg:gap-10">
        <aside className="flex flex-col gap-3 lg:col-span-5 lg:pt-2">
          <p className="max-w-md text-xl leading-snug font-semibold tracking-tight text-balance md:text-2xl">
            Documenta la operación por chat y confírmala con las partes.
          </p>
          <p className="max-w-md text-base text-muted-foreground">
            Demostración en Hedera Testnet, una red de práctica. Usa datos de ejemplo.
          </p>
        </aside>
        <div className="flex flex-col gap-4 lg:col-span-6 lg:col-start-7">{children}</div>
      </main>
    </>
  );
}
