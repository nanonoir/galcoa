import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DemoColor, DemoRemito, DemoStep, DemoViewProps } from "@/features/demo/contracts/demo-view";

/**
 * Demo pública de GALCOA+ (conversion-funnel.md, D1 y D2). Cuatro pasos del
 * flujo real con datos de ejemplo. La entrega de ejemplo no se guarda ni se registra en Hedera, y
 * lo dice siempre. La invitación a registrarse acompaña sin bloquear.
 */

const STEPS: { id: DemoStep; title: string }[] = [
  { id: 1, title: "Contá la entrega" },
  { id: 2, title: "Se controla" },
  { id: 3, title: "El comercio confirma" },
  { id: 4, title: "Se calcula la huella" },
];

const REMITO_OPTIONS: { id: DemoRemito; title: string; hint: string }[] = [
  { id: "coincide", title: "Remito que coincide", hint: "El comprobante dice lo mismo que tu mensaje." },
  { id: "diferencia", title: "Remito con diferencia", hint: "El comprobante dice 2 cajas menos (el caso 200/198)." },
  { id: "sin_remito", title: "Sin remito", hint: "Solo tu mensaje, sin comprobante." },
];

const COLOR_COPY: Record<DemoColor, { label: string; title: string; className: string }> = {
  verde: { label: "Verde", title: "Coincide: los datos son iguales al comprobante", className: "border-success text-success" },
  amarillo: { label: "Amarillo", title: "Declarado: sin comprobante que lo respalde", className: "border-warning text-warning" },
  rojo: { label: "Rojo", title: "Requiere revisión: no se puede sellar", className: "border-destructive text-destructive" },
};

function Stepper({ current }: { current: DemoStep }) {
  return (
    <ol aria-label="Pasos de la demo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((step) => {
        const state = step.id < current ? "hecho" : step.id === current ? "actual" : "pendiente";
        return (
          <li
            key={step.id}
            aria-current={state === "actual" ? "step" : undefined}
            className={`flex items-center gap-2 border px-3 py-2 text-sm ${state === "actual" ? "border-primary bg-primary/10 font-semibold" : state === "hecho" ? "border-border text-foreground" : "border-border text-muted-foreground"}`}
          >
            <span aria-hidden className="font-mono text-xs">{state === "hecho" ? "✓" : step.id}</span>
            <span>{step.title}</span>
            <span className="sr-only">({state})</span>
          </li>
        );
      })}
    </ol>
  );
}

function SignupNudge({ signupHref, onCtaClick }: Pick<DemoViewProps, "signupHref" | "onCtaClick">) {
  return (
    <aside aria-label="Crear cuenta" className="flex flex-col gap-2 border border-dashed border-border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">¿Te imaginás esto con tus entregas reales? La cuenta se crea en menos de un minuto.</p>
      <a href={signupHref} onClick={() => onCtaClick("demo_nudge")} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Crear mi cuenta
      </a>
    </aside>
  );
}

export function DemoExperience(props: DemoViewProps) {
  const { state } = props;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="h-auto w-fit max-w-full py-1 text-left whitespace-normal">Demo con datos de ejemplo — la entrega de ejemplo no se guarda ni se registra en Hedera</Badge>
          <p className="text-xs text-muted-foreground">Medimos el uso de la demo con un identificador de navegador seudónimo; respetamos «No rastrear» (DNT/GPC).</p>
        </div>
        {state.step > 1 ? (
          <Button variant="ghost" size="sm" onClick={props.onRestart}>
            Empezar de nuevo
          </Button>
        ) : null}
      </div>

      <Stepper current={state.step} />

      {state.error ? (
        <p role="alert" className="border border-destructive p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-6">
        {state.step === 1 ? <StoryStep {...props} /> : null}
        {state.step === 2 ? <ControlStep {...props} /> : null}
        {state.step === 3 ? <ConfirmStep {...props} /> : null}
        {state.step === 4 ? <SealStep {...props} /> : null}
      </div>
    </div>
  );
}

function StoryStep({ state, onQuantityChange, onRemitoChange, onBuild }: DemoViewProps) {
  return (
    <section aria-labelledby="demo-paso-1" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="demo-paso-1" className="text-2xl font-semibold tracking-tight">1. Contá la entrega como se la contarías a alguien</h2>
        <p className="text-sm text-muted-foreground">En GALCOA+ escribís un mensaje y adjuntás la foto del remito. Acá lo armamos por vos.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="demo-cantidad">¿Cuántas cajas entregaste?</Label>
        <Input
          id="demo-cantidad"
          inputMode="numeric"
          value={state.quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          aria-invalid={state.quantityError ? true : undefined}
          aria-describedby={state.quantityError ? "demo-cantidad-error" : undefined}
          className="max-w-40"
        />
        {state.quantityError ? (
          <p id="demo-cantidad-error" className="text-sm text-destructive">
            {state.quantityError}
          </p>
        ) : null}
      </div>

      <figure className="flex max-w-xl flex-col gap-1 self-end border border-border bg-card p-3">
        <figcaption className="tech-label">Tu mensaje</figcaption>
        <p>{state.message}</p>
      </figure>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">¿Qué dice el remito que adjuntás?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {REMITO_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer flex-col gap-1 border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${state.remito === option.id ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="demo-remito" value={option.id} checked={state.remito === option.id} onChange={() => onRemitoChange(option.id)} />
                {option.title}
              </span>
              <span className="text-muted-foreground">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.remitoText ? (
        <figure className="flex max-w-xl flex-col gap-1 border border-border bg-card p-3">
          <figcaption className="tech-label">Lectura del remito (ejemplo)</figcaption>
          <p className="font-mono text-sm">{state.remitoText}</p>
        </figure>
      ) : null}

      <div>
        <Button size="lg" onClick={onBuild} disabled={Boolean(state.quantityError)}>
          Armar y controlar el documento
        </Button>
      </div>
    </section>
  );
}

function ControlStep({ state, signupHref, onBackToStory, onRequestConfirmation, onCtaClick }: DemoViewProps) {
  const verdict = state.verdict;
  const doc = state.document;
  if (!verdict || !doc) return null;
  const copy = COLOR_COPY[verdict.color];
  return (
    <section aria-labelledby="demo-paso-2" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="demo-paso-2" className="text-2xl font-semibold tracking-tight">2. La IA ordena los datos; las reglas deciden</h2>
        <p className="text-sm text-muted-foreground">
          En la demo la extracción está simulada. El color lo calcula el mismo motor de reglas que usa GALCOA+: la IA nunca decide el veredicto.
        </p>
      </div>

      <dl className="grid max-w-xl grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 border border-border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Comercio</dt>
        <dd>{doc.comercio}</dd>
        <dt className="text-muted-foreground">Producto</dt>
        <dd>{doc.producto}</dd>
        <dt className="text-muted-foreground">Cantidad</dt>
        <dd>
          {doc.cantidad} {doc.unidad}
        </dd>
        <dt className="text-muted-foreground">Hora</dt>
        <dd>{doc.hora}</dd>
      </dl>

      <div role="status" className={`flex max-w-xl flex-col gap-2 border-2 p-4 ${copy.className}`}>
        <p className="text-xs font-semibold tracking-wide uppercase">{copy.label}</p>
        <p className="text-lg font-semibold text-foreground">{copy.title}</p>
        <ul className="list-disc pl-5 text-sm text-foreground">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      {verdict.sealable ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={onRequestConfirmation}>
            Pedir confirmación al comprador
          </Button>
          <Button size="lg" variant="outline" onClick={onBackToStory}>
            Probar otro caso
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm">En GALCOA+ un rojo nunca se «aprueba igual»: se corrige, queda registrado qué cambió y todos vuelven a confirmar.</p>
          <div>
            <Button size="lg" onClick={onBackToStory}>
              Corregir la entrega
            </Button>
          </div>
        </div>
      )}

      <SignupNudge signupHref={signupHref} onCtaClick={onCtaClick} />
    </section>
  );
}

function ConfirmStep({ state, qr, onMerchantConfirm }: DemoViewProps) {
  return (
    <section aria-labelledby="demo-paso-3" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="demo-paso-3" className="text-2xl font-semibold tracking-tight">3. El comercio confirma con un QR, sin crear una cuenta</h2>
        <p className="text-sm text-muted-foreground">Ahora sos el comprador: revisás la misma versión del documento y confirmás.</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr ? <div className="shrink-0">{qr}</div> : null}
        <div className="flex max-w-md flex-col gap-3 border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Almacén Ejemplo — confirmación de entrega (ejemplo)</p>
          <p>
            {state.document?.cantidad} {state.document?.unidad} de {state.document?.producto}, a las {state.document?.hora}.
          </p>
          <p className="text-muted-foreground">La confirmación muestra quién la dio con el enlace, no verifica identidad.</p>
          <Button onClick={onMerchantConfirm}>Confirmar la entrega como comprador</Button>
        </div>
      </div>
    </section>
  );
}

function SealStep({ state, signupHref, pricingHref, onSeal, onCtaClick }: DemoViewProps) {
  return (
    <section aria-labelledby="demo-paso-4" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="demo-paso-4" className="text-2xl font-semibold tracking-tight">4. Se calcula la huella del documento de ejemplo</h2>
        <p className="text-sm text-muted-foreground">
          La huella SHA-256 identifica este documento exacto: si alguien lo cambia, deja de coincidir. Prueba que no se modificó, no que lo declarado sea verdadero.
        </p>
      </div>

      {state.hash ? (
        <div className="flex max-w-2xl flex-col gap-2 border border-success p-4">
          <p className="tech-label">Huella del documento de ejemplo</p>
          <p className="font-mono text-sm break-all">{state.hash}</p>
          <p className="text-sm text-muted-foreground">
            En la demo no se registra nada en Hedera. En tu cuenta, al finalizar con todas las confirmaciones, una huella como esta se registra en Hedera Testnet y cualquiera la puede comprobar con el QR del PDF.
          </p>
        </div>
      ) : (
        <div>
          <Button size="lg" onClick={onSeal} disabled={state.sealing}>
            {state.sealing ? "Calculando la huella…" : "Calcular la huella del documento"}
          </Button>
        </div>
      )}

      {state.hash ? (
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <h3 className="text-xl font-semibold tracking-tight">Esto mismo, con tus entregas reales</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Creá tu cuenta y te guiamos hasta registrar la huella de tu primera entrega. Tu historial de operaciones es tu mejor carta de presentación.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={signupHref} onClick={() => onCtaClick("demo_final")} className={buttonVariants({ size: "lg", className: "px-6" })}>
              Crear mi cuenta
            </a>
            <a href={pricingHref} onClick={() => onCtaClick("demo_pricing")} className={buttonVariants({ size: "lg", variant: "outline", className: "px-6" })}>
              Ver planes
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
