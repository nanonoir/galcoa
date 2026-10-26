"use client";

import { useState } from "react";

/**
 * Recorrido explicativo del hero: registrar → revisar y confirmar → respaldar.
 * Es una demostración con texto fijo y datos de ejemplo: no representa ni
 * consulta ningún documento real, y seleccionar una etapa solo cambia lo que
 * se muestra. Funciona con mouse (hover), toque/clic y teclado (Tab + Enter/Espacio).
 * Todas las descripciones están siempre en el DOM; la ilustración reserva el
 * alto de la etapa más larga, así que seleccionar no mueve ningún control.
 */
const STEPS = [
  {
    title: "Registrá la entrega",
    description: "Contás la entrega por chat y adjuntás el remito o el comprobante. La IA ordena los datos en un borrador.",
    sample: [
      { label: "Vos", text: "Entregué 200 cajas en el almacén. Adjunto el remito." },
      { label: "Borrador", text: "Entrega: 200 cajas · Respaldo: remito.pdf" },
      { label: "Estado", text: "Falta la confirmación del comercio" },
    ],
  },
  {
    title: "Revisá y obtené la confirmación",
    description: "Revisás el documento y le compartís al comercio un enlace o QR para que confirme exactamente lo mismo, sin crear una cuenta.",
    sample: [
      { label: "Revisión 1", text: "Congelada · mismo contenido para todas las partes" },
      { label: "Comercio", text: "Confirma la revisión 1 desde su enlace o QR" },
      { label: "Cambio material", text: "Crea la revisión 2, sin heredar confirmaciones" },
    ],
  },
  {
    title: "Respaldá tu trabajo",
    description: "Con las confirmaciones se genera el PDF y se registra en Hedera Testnet una huella que permite comprobar que no cambió, sin publicar el contenido.",
    sample: [
      { label: "PDF", text: "Se genera con la revisión confirmada" },
      { label: "Huella", text: "9f2c…e41a (ejemplo)" },
      { label: "Hedera Testnet", text: "Se guarda solo la huella, no el contenido" },
    ],
  },
] as const;

export function HeroJourney() {
  const [active, setActive] = useState(0);

  return (
    <div>
      <p className="tech-label mb-4">Recorrido de un registro</p>
      <Illustration active={active} />
      <ol aria-label="Recorrido de un registro" className="flex flex-col border-l border-border">
        {STEPS.map((step, index) => {
          const selected = index === active;
          const reached = index <= active;
          return (
            <li key={step.title} className="relative border-b border-border last:border-b-0">
              <span
                aria-hidden="true"
                className={`absolute top-5 left-0 flex size-6 -translate-x-1/2 items-center justify-center border text-xs font-semibold transition-[background-color,border-color,color] duration-200 ease-out ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : reached
                      ? "border-primary bg-secondary text-secondary-foreground"
                      : "border-input bg-secondary text-secondary-foreground"
                }`}
              >
                {index + 1}
              </span>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setActive(index)}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActive(index);
                }}
                className="flex w-full flex-col gap-1 py-5 pr-2 pl-8 text-left outline-offset-[-2px] transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span data-step-title className="text-lg font-semibold tracking-tight">
                  {step.title}
                </span>
                <span
                  className={`text-[0.9375rem] leading-relaxed transition-colors duration-200 ease-out ${
                    selected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.description}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Ilustración de la etapa activa: todas las etapas ocupan la misma celda, así que el alto no cambia al seleccionar. */
function Illustration({ active }: { active: number }) {
  return (
    <figure aria-hidden="true" className="mb-6 border border-border bg-card p-4">
      <figcaption className="tech-label mb-3">Ejemplo ilustrativo · no es un documento real</figcaption>
      <div className="grid">
        {STEPS.map((step, index) => (
          <ul
            key={step.title}
            className={`col-start-1 row-start-1 flex flex-col gap-2 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:translate-y-0 ${
              index === active ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"
            }`}
          >
            {step.sample.map((row) => (
              <li key={row.label} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border/60 pb-2 text-[0.8125rem] last:border-b-0 last:pb-0">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={row.label === "Huella" ? "font-mono" : undefined}>{row.text}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </figure>
  );
}
