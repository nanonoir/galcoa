import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LandingViewProps } from "@/features/marketing/contracts/landing-view";

import { SiteNavigation } from "./site-navigation";

/**
 * Landing pública (MVP-114; PRD REQ-02, §5, §10, §11). Muestra el copy que
 * recibe como texto (nunca HTML) y los enlaces como datos. No consulta sesión:
 * el escenario «con sesión» solo cambia los enlaces que llegan en `content`.
 */
export function LandingPage({ content, headerAction }: LandingViewProps) {
  return (
    <div className="flex flex-col">
      <SiteNavigation brand={content.brand} action={headerAction} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10">
        <section aria-labelledby="landing-title" className="flex flex-col items-start gap-4">
          <h1 id="landing-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {content.heading}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">{content.summary}</p>
          <a href={content.primaryAction.href} className={buttonVariants({ size: "lg", className: "px-4" })}>
            {content.primaryAction.label}
          </a>
        </section>

        <section id="como-funciona" aria-labelledby="como-funciona-title" className="flex flex-col gap-4">
          <h2 id="como-funciona-title" className="text-xl font-semibold">
            Cómo funciona
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {content.features.map((feature) => (
              <li key={feature.title}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      <h3>{feature.title}</h3>
                    </CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section id="alcance" aria-labelledby="alcance-title" className="flex flex-col gap-4">
          <h2 id="alcance-title" className="text-xl font-semibold">
            Alcance
          </h2>
          {content.limits.length > 0 && (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
              {content.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
