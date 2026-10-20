import Link from "next/link";

import { BrandLockup } from "@/components/ui/brand-lockup";
import { LogoutButton } from "@/features/auth/containers/auth-containers";
import { requirePageUser } from "@/lib/supabase/auth";

import { verifiedRequestSession } from "./_lib/session";

/** Grupo privado (MVP-030): toda página debajo exige sesión verificada; nunca se prerenderiza ni se cachea. */
export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser(verifiedRequestSession);
  return (
    <>
      <header className="border-b bg-background/90">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-stretch justify-between gap-2 pl-4 sm:gap-4">
          <nav aria-label="Principal" className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href="/"
              aria-label="GALCOA+, ir al inicio"
              className="inline-flex min-h-11 items-center outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <BrandLockup />
            </Link>
            <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
            <Link
              href="/dashboard"
              className="tech-label inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Mis documentos
            </Link>
            <span aria-hidden="true" className="tech-label hidden xl:inline">Testnet</span>
          </nav>
          <LogoutButton className="h-auto min-h-14 shrink-0 rounded-none border-0 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:px-6" />
        </div>
      </header>
      {children}
    </>
  );
}
