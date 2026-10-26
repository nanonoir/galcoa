import type { CSSProperties } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { LandingViewProps } from "@/features/marketing/contracts/landing-view";

import { HeroJourney } from "./hero-journey";
import { SiteNavigation } from "./site-navigation";

/**
 * Landing pública (MVP-114; PRD REQ-02, §5, §10, §11). Muestra el copy que
 * recibe como texto (nunca HTML) y los enlaces como datos. No consulta sesión:
 * el escenario «con sesión» solo cambia los enlaces que llegan en `content`.
 * El ancho coincide con el del encabezado (`max-w-6xl`).
 */
export function LandingPage({ content, headerAction }: LandingViewProps) {
  return (
    <div className="flex flex-col">
      <SiteNavigation brand={content.brand} action={headerAction} />

      <main className="flex flex-col">
        <section aria-labelledby="landing-title" className="border-b">
          <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-4 pt-8 pb-12 md:pt-12 md:pb-14 lg:grid-cols-12 lg:gap-10">
            <div className="flex flex-col items-start gap-5 lg:col-span-7">
              <h1
                id="landing-title"
                className="text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance min-[390px]:text-[2.5rem] md:text-6xl lg:text-[4rem] lg:tracking-[-0.04em]"
              >
                {content.heading}
              </h1>
              <p
                className="motion-enter max-w-xl text-[1.0625rem] leading-[1.55] text-muted-foreground md:text-lg"
                style={{ "--enter-delay": "40ms" } as CSSProperties}
              >
                {content.summary}
              </p>
              <div className="motion-enter flex w-full flex-col gap-3 sm:w-auto sm:flex-row" style={{ "--enter-delay": "80ms" } as CSSProperties}>
                <a href={content.primaryAction.href} className={buttonVariants({ size: "lg", className: "px-6" })}>
                  {content.primaryAction.label}
                </a>
                {content.secondaryAction ? (
                  <a href={content.secondaryAction.href} className={buttonVariants({ size: "lg", variant: "outline", className: "px-6" })}>
                    {content.secondaryAction.label}
                  </a>
                ) : null}
              </div>

              {content.problem ? (
                <section aria-labelledby="problema-title" className="mt-3 flex w-full max-w-xl flex-col gap-2 border-t border-border pt-4">
                  <h2 id="problema-title" className="text-sm font-semibold tracking-wide text-muted-foreground">
                    {content.problem.title}
                  </h2>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {content.problem.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section id="como-funciona" aria-labelledby="como-funciona-title" className="mt-3 flex w-full max-w-xl flex-col gap-1 border-t border-border pt-4">
                <h2
                  id="como-funciona-title"
                  className="motion-enter text-sm font-semibold tracking-wide text-muted-foreground"
                  style={{ "--enter-delay": "120ms" } as CSSProperties}
                >
                  Cómo funciona
                </h2>
                <ul className="flex flex-col">
                  {content.features.map((feature, index) => (
                    <li
                      key={feature.title}
                      className="motion-enter grid gap-0.5 border-b border-border px-2 py-3 transition-colors duration-200 last:border-b-0 hover:bg-card/60 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4"
                      style={{ "--enter-delay": `${160 + index * 60}ms` } as CSSProperties}
                    >
                      <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="motion-enter lg:col-span-5" style={{ "--enter-delay": "80ms" } as CSSProperties}>
              <HeroJourney />
            </div>
          </div>
        </section>

        {content.upcoming ? (
          <section aria-labelledby="proximamente-title" className="border-b">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-12 md:py-16">
              <p className="eyebrow">{content.upcoming.label}</p>
              <h2 id="proximamente-title" className="max-w-3xl text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance md:text-5xl">
                {content.upcoming.title}
              </h2>
              <p className="max-w-2xl text-[1.0625rem] leading-[1.55] text-muted-foreground md:text-lg">{content.upcoming.description}</p>
              <figure className="flex max-w-2xl flex-col gap-2 border border-border bg-card p-4">
                <figcaption className="tech-label">Ejemplo ilustrativo</figcaption>
                <p className="font-mono text-base md:text-lg">{content.upcoming.example}</p>
              </figure>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{content.upcoming.disclaimer}</p>
            </div>
          </section>
        ) : null}

        {content.pricingTeaser ? (
          <section aria-labelledby="planes-title" className="border-b">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="planes-title" className="max-w-2xl text-lg leading-snug font-semibold">
                {content.pricingTeaser.text}
              </h2>
              <a href={content.pricingTeaser.link.href} className={buttonVariants({ variant: "outline", className: "px-5" })}>
                {content.pricingTeaser.link.label}
              </a>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
