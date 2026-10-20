import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PublicBrandHeader } from "@/components/ui/public-brand-header";
import { VerifierContainer } from "@/features/documents/containers/verifier-container";
import type { PublicVerification } from "@/lib/contracts/public";
import { createPublicVerification } from "@/lib/documents/verification/runtime";

/**
 * Verificador público (MVP-101). Server Component: lee el estado del registro
 * sin archivo y pasa solo el DTO público al container. Distinto de la
 * invitación (`confirm/[token]`): no confirma nada. Sin login, sin caché,
 * `noindex` y sin `referrer`. Si algo falla, error técnico: nunca un estado inventado.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificación pública",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Initial = { status: "ready"; verification: PublicVerification } | { status: "error"; message: string };

async function load(reference: string): Promise<Initial> {
  try {
    const { service, limiter } = createPublicVerification();
    const decision = await limiter.check("read", new Request("http://localhost/", { headers: new Headers(await headers()) }));
    if (!decision.allowed) {
      return {
        status: "error",
        message: decision.reason === "limited" ? "Hiciste muchos intentos seguidos. Esperá un minuto y volvé a probar." : "El servicio no está disponible por ahora. Probá de nuevo en unos minutos.",
      };
    }
    return { status: "ready", verification: await service.verify(reference) };
  } catch {
    return { status: "error", message: "No pudimos consultar el registro. Probá de nuevo en unos minutos." };
  }
}

export default async function VerifyPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const initial = await load(reference);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PublicBrandHeader context="Verificación pública · Hedera Testnet" />
      <main className="motion-enter px-4 py-8">
        {initial.status === "ready" ? (
          <VerifierContainer reference={reference} initial={initial.verification} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <h1 className="font-heading text-xl font-semibold">Verificación pública</h1>
            <Alert>
              <AlertTitle>No pudimos completar la verificación</AlertTitle>
              <AlertDescription>{initial.message}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-4 text-sm">
              <a href={`/verify/${encodeURIComponent(reference)}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                Reintentar
              </a>
              <Link href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">
                Volver al inicio
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
