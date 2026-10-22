import { SignupContext } from "@/features/conversion/components/signup-context";
import { TrackView } from "@/features/conversion/containers/track-view";
import { RegisterContainer } from "@/features/auth/containers/auth-containers";
import { PLANS, PlanIdSchema, SignupOriginSchema } from "@/lib/contracts/conversion";

import { AuthLinks } from "../auth-ui";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RegistroPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const origin = SignupOriginSchema.safeParse(params.origen);
  const plan = PlanIdSchema.safeParse(params.plan);
  const planName = plan.success ? (PLANS.find((p) => p.id === plan.data)?.name ?? null) : null;
  const source = origin.success ? origin.data : null;
  return (
    <>
      <TrackView event="signup_viewed" source={source} plan={plan.success ? plan.data : null} />
      <SignupContext origin={source} planName={planName} />
      <RegisterContainer origin={source} />
      <AuthLinks
        links={[
          { href: "/acceso", label: "Ya tengo una cuenta" },
          { href: "/demo", label: "Probar la demo sin registrarme" },
        ]}
      />
    </>
  );
}
