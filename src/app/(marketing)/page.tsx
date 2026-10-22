import Link from "next/link";

import { LogoutButton } from "@/features/auth/containers/auth-containers";
import { TrackView } from "@/features/conversion/containers/track-view";
import { LandingPage } from "@/features/marketing/components/landing-page";
import { buildLandingContent } from "@/features/marketing/containers/landing-content";
import { getCurrentSession, LOGIN_PATH } from "@/lib/supabase/auth";

/** Página pública: si Auth no responde se muestra la versión de visitante, sin error ni datos privados. */
export const dynamic = "force-dynamic";

/** Bloque amarillo de alto completo a la derecha del encabezado, igual que en el área privada. */
const HEADER_ACTION =
  "inline-flex h-full items-center rounded-none border-0 bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default async function HomePage() {
  const session = await getCurrentSession().catch(() => ({ status: "unavailable" as const }));
  const signedIn = session.status === "authenticated";
  return (
    <>
      {signedIn ? null : <TrackView event="landing_viewed" />}
      <LandingPage
      content={buildLandingContent(signedIn)}
      headerAction={
        signedIn ? (
          <LogoutButton className={HEADER_ACTION} />
        ) : (
          <Link href={LOGIN_PATH} className={HEADER_ACTION}>
            Ingresar
          </Link>
        )
      }
      />
    </>
  );
}
