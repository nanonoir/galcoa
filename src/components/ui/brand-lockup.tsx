/**
 * Marca compartida de las cabeceras: logo GALCOA+ (`.galcoa-brand`, `/galcoa.svg`) y,
 * a su lado, el logo de Hedera (`.hedera-logo`, `/hedera.svg`), ambos tal cual, con
 * transparencia, sin placa, filtro ni recoloreado. Presentación pura, sin `next/image`:
 * son fondos CSS de archivos de `public/`. El nombre accesible de GALCOA+ lo aporta
 * `label`; el enlace que lo envuelva puede definir su propio `aria-label`.
 */
export function BrandLockup({ label = "GALCOA+" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-3 sm:gap-5">
      <span className="galcoa-brand">
        <span className="sr-only">{label}</span>
      </span>
      <span role="img" aria-label="Hedera" className="hedera-logo" />
    </span>
  );
}
