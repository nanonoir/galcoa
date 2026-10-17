import Link from "next/link";

import { LogoutButton } from "@/features/auth/containers/auth-containers";
import { requirePageUser } from "@/lib/supabase/auth";

import { verifiedRequestSession } from "./_lib/session";

/** Grupo privado (MVP-030): toda página debajo exige sesión verificada; nunca se prerenderiza ni se cachea. */
export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser(verifiedRequestSession);
  return (
    <>
      <header className="h-16 border-b">
        <div className="mx-auto flex h-full w-full max-w-6xl items-stretch justify-between gap-4 pl-4">
          <nav aria-label="Principal" className="flex items-center gap-4">
            <Link href="/" className="galcoa-brand"><span className="sr-only">GALCOA+</span></Link>
            <span aria-hidden="true" className="tech-label hidden sm:inline">Hedera · Testnet</span>
            <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
            <Link href="/dashboard" className="tech-label text-foreground underline-offset-4 hover:underline">Mis documentos</Link>
          </nav>
          <LogoutButton className="h-full rounded-none border-0 bg-primary px-6 font-mono text-xs tracking-wider text-primary-foreground uppercase hover:bg-primary/90" />
        </div>
      </header>
      {children}
    </>
  );
}
