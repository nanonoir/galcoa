import { LandingPage } from "@/features/marketing/components/landing-page";
import { buildLandingContent } from "@/features/marketing/containers/landing-content";
import { getCurrentSession } from "@/lib/supabase/auth";

/** Página pública: si Auth no responde se muestra la versión de visitante, sin error ni datos privados. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession().catch(() => ({ status: "unavailable" as const }));
  return <LandingPage content={buildLandingContent(session.status === "authenticated")} />;
}
