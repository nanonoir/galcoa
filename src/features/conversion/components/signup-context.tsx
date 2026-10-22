import type { SignupOrigin } from "@/lib/contracts/conversion";

/**
 * Contexto junto al formulario de registro (conversion-funnel.md, D2 y D3):
 * continúa la conversación según de dónde viene el visitante. Solo texto.
 */
export function SignupContext({ origin, planName }: { origin: SignupOrigin | null; planName: string | null }) {
  const title =
    origin === "demo"
      ? "Ya viste cómo una entrega se vuelve una prueba. Ahora, con las tuyas."
      : origin === "precios" && planName
        ? `Elegiste el plan ${planName}. Primero creá tu cuenta.`
        : "Creá tu cuenta y documentá tu primera entrega hoy.";
  return (
    <section aria-label="Por qué crear la cuenta" className="flex flex-col gap-3 border border-border bg-card p-4">
      <p className="font-semibold">{title}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>Solo correo y contraseña: no te pedimos tarjeta.</li>
        <li>Te guiamos paso a paso hasta sellar tu primer documento.</li>
        {origin === "precios" && planName ? <li>El plan lo activamos cuando lo confirmes desde «Planes»; hasta entonces, probás sin cargo.</li> : null}
      </ul>
    </section>
  );
}
