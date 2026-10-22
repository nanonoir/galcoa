import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PricingViewProps } from "@/features/conversion/contracts/pricing-view";

/**
 * Planes y contratación (conversion-funnel.md, D5; reglas de producto §9). Los
 * precios son de prueba y se informan en USD. Sin cobro automático: contratar
 * registra una solicitud que el equipo activa en el piloto, y la pantalla lo dice.
 */
export function PricingPlans({ plans, signedIn, suggestedPlan, request, signupHref, onChoose }: PricingViewProps) {
  return (
    <div className="flex flex-col gap-6">
      {request.status === "requested" ? (
        <div role="status" className="flex flex-col gap-1 border border-success p-4">
          <p className="font-semibold">
            {request.alreadyRequested ? "Ya tenías una solicitud para este plan." : "¡Listo! Registramos tu solicitud."}
          </p>
          <p className="text-sm text-muted-foreground">
            Te contactamos para activar el plan y acordar el medio de pago en pesos. Mientras tanto, seguí usando tu cuenta.
          </p>
        </div>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const busy = request.status === "submitting" && request.plan === plan.id;
          const error = request.status === "error" && request.plan === plan.id ? request.message : null;
          const featured = suggestedPlan ? suggestedPlan === plan.id : plan.highlighted;
          return (
            <li key={plan.id} className={`flex flex-col gap-4 border p-5 ${featured ? "border-primary" : "border-border"}`} aria-labelledby={`plan-${plan.id}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={`plan-${plan.id}`} className="text-xl font-semibold tracking-tight">
                  {plan.name}
                </h2>
                {featured ? <Badge>{suggestedPlan === plan.id ? "Elegido" : "Recomendado"}</Badge> : null}
              </div>
              <p>
                <span className="text-3xl font-semibold">USD {plan.priceUsdMonthly}</span>
                <span className="text-sm text-muted-foreground"> / mes</span>
              </p>
              <ul className="flex flex-1 list-disc flex-col gap-1 pl-5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {signedIn ? (
                <Button onClick={() => onChoose(plan.id)} disabled={request.status === "submitting"} variant={featured ? "default" : "outline"}>
                  {busy ? "Enviando…" : `Contratar ${plan.name}`}
                </Button>
              ) : (
                <a href={signupHref(plan.id)} onClick={() => onChoose(plan.id)} className={buttonVariants({ variant: featured ? "default" : "outline" })}>
                  Empezar con {plan.name}
                </a>
              )}
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">
        Precios de prueba en dólares; te informamos el equivalente en pesos. El comercio que confirma y la marca que consulta no pagan. Hoy el sello se
        registra en Hedera Testnet, una red de práctica.
      </p>
    </div>
  );
}
