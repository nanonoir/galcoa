import type { Metadata } from "next";
import { headers } from "next/headers";

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
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground">
      {initial.status === "ready" ? (
        <VerifierContainer reference={reference} initial={initial.verification} />
      ) : (
        <p role="alert" className="mx-auto max-w-2xl text-sm">
          {initial.message}
        </p>
      )}
    </main>
  );
}
