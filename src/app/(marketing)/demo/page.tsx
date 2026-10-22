import type { Metadata } from "next";

import { PublicBrandHeader } from "@/components/ui/public-brand-header";
import { DemoContainer } from "@/features/demo/containers/demo-container";

/**
 * Demo pública sin registro (conversion-funnel.md, D1). No lee sesión ni
 * servicios: todo ocurre en el navegador con datos de ejemplo.
 */
export const metadata: Metadata = {
  title: "Probá GALCOA+ sin registrarte",
  description: "Contá una entrega, mirá cómo se controla, confirmala como el comercio y sellá su huella. Demo con datos de ejemplo.",
};

export default function DemoPage() {
  return (
    <>
      <PublicBrandHeader context="Demo pública · datos de ejemplo" />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:py-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Probalo en 2 minutos</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">Así se convierte una entrega en una prueba</h1>
          <p className="text-muted-foreground">Sin cuenta, sin datos reales. Probá el caso que coincide y el de las cajas que faltan.</p>
        </div>
        <DemoContainer />
      </main>
    </>
  );
}
