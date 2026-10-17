import type { Metadata } from "next";
import { headers } from "next/headers";

import { ConfirmationContainer } from "@/features/corroborations/containers/confirmation-container";
import type { ConfirmationViewState } from "@/features/corroborations/contracts/confirmation-screen";
import { createPublicReview } from "@/lib/documents/review-runtime";

/**
 * Pantalla pública de confirmación (MVP-076). Server Component: lee la
 * invitación **sin consumirla** y pasa solo el DTO público al container.
 * Sin login, sin caché, `noindex` y sin `referrer`. La lectura pasa por el
 * mismo límite de abuso que el endpoint. Si algo falla, muestra un error
 * técnico, nunca un éxito ni un estado inventado.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revisión de una operación",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function loadInitialState(token: string): Promise<ConfirmationViewState> {
  const technical = (message: string): ConfirmationViewState => ({ status: "technical_error", message });
  try {
    const review = createPublicReview();
    const decision = await review.limiter.check("read", new Request("http://localhost/", { headers: new Headers(await headers()) }));
    if (!decision.allowed) {
      return technical(decision.reason === "limited" ? "Hiciste muchos intentos seguidos. Esperá un minuto y volvé a probar." : "El servicio no está disponible por ahora. Probá de nuevo en unos minutos.");
    }
    const result = await review.invitations.read(token);
    if (!result.ok) return technical("No pudimos cargar la operación. Probá de nuevo en unos minutos.");
    if (result.value.kind === "available") return { status: "ready", invitation: result.value.invitation };
    return { status: "unavailable", reason: result.value.availability };
  } catch {
    return technical("No pudimos cargar la operación. Probá de nuevo en unos minutos.");
  }
}

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const initial = await loadInitialState(token);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <ConfirmationContainer token={token} initial={initial} />
    </main>
  );
}
