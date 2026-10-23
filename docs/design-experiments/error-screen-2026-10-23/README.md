# ErrorScreen (F-8): capturas a 360 y 1280 px (2026-10-23)

Componente de presentación `src/features/errors/components/error-screen.tsx`, ticket F-8 del
[plan de onboarding](https://github.com/nanonoir/galcoa/blob/feat/onboarding-flujo-usuario/docs/exec-plans/active/onboarding-flujo-usuario.md)
(sección P6). Lo montan las rutas de Next que son de Nahuel (N-2): `not-found.tsx`, `error.tsx` y `global-error.tsx`.

| Caso | Qué muestra | 360 px | 1280 px |
| --- | --- | --- | --- |
| `not-found` | «No encontramos esta página» · Ir a mis documentos · Ir al inicio | [ver](evidence/f8-no-encontrado-360.png) | [ver](evidence/f8-no-encontrado-1280.png) |
| `error` | «Algo falló al cargar» · Reintentar · Ir a mis documentos · código de referencia | [ver](evidence/f8-error-al-cargar-360.png) | [ver](evidence/f8-error-al-cargar-1280.png) |
| `fatal` | «GALCOA+ no pudo abrirse» · Reintentar · código de referencia | [ver](evidence/f8-error-grave-360.png) | [ver](evidence/f8-error-grave-1280.png) |

Ninguna captura tiene desborde horizontal. Se tomaron con una entrada **temporal** del preview que no se commiteó
(`preview/registry.ts` y los mocks son del líder).

## Cómo se conecta (N-2, para Nahuel)

```tsx
// src/app/(app)/error.tsx — Client Component de Next
"use client";
import { ErrorScreen } from "@/features/errors/components/error-screen";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen kind="error" reference={error.digest} onRetry={reset} />;
}
```

`not-found.tsx` usa `kind="not-found"` (sin código ni reintento) y `global-error.tsx` usa `kind="fatal"` dentro de su
propio `<html><body>`. Revisar contra la guía de Next 16 en `node_modules/next/dist/docs/` antes de crear las rutas.

## Seguridad

`reference` solo se muestra si es un código corto alfanumérico (`^[A-Za-z0-9_-]{1,64}$`). Si por error llega un
mensaje o una traza, no se muestra nada (test «nunca muestra un mensaje o una traza como código de referencia»).

## Ubicación

`src/features/errors/components/` es la propuesta de la pregunta 8 del plan. Si preferís otra carpeta, se mueve sin
cambiar la API.
