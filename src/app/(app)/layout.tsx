import Image from "next/image";
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
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <nav aria-label="Principal" className="flex items-center gap-4 text-sm font-medium">
            <Link href="/" aria-label="GALCOA+, inicio">
              <Image src="/logo-galcoa.svg" alt="GALCOA+" width={125} height={33} priority unoptimized />
            </Link>
            <Link href="/dashboard" className="underline-offset-4 hover:underline">Mis documentos</Link>
          </nav>
          <LogoutButton />
        </div>
      </header>
      {children}
    </>
  );
}
