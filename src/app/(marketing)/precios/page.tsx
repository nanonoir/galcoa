import type { Metadata } from "next";

import { PublicBrandHeader } from "@/components/ui/public-brand-header";
import { PricingContainer } from "@/features/conversion/containers/pricing-container";
import { PlanIdSchema } from "@/lib/contracts/conversion";
import { getCurrentSession } from "@/lib/supabase/auth";

/** Planes (conversion-funnel.md, D5). Pública: con sesión permite solicitar el plan; sin sesión, registrarse con él. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planes · GALCOA+",
  description: "Abono mensual para distribuidoras. El comercio que confirma y la marca que consulta no pagan.",
};

export default async function PreciosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const suggested = PlanIdSchema.safeParse(params.plan);
  const session = await getCurrentSession().catch(() => ({ status: "unavailable" as const }));
  return (
    <>
      <PublicBrandHeader context="Planes" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">Un abono mensual, según cuántas entregas documentás</h1>
          <p className="max-w-2xl text-muted-foreground">
            Empezá con la demo o creando tu cuenta; elegí el plan cuando ya hayas sellado tu primera entrega.
          </p>
        </div>
        <PricingContainer signedIn={session.status === "authenticated"} suggestedPlan={suggested.success ? suggested.data : null} />
      </main>
    </>
  );
}
