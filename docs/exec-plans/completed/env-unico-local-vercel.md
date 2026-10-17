# Entorno local único (`.env`) y paridad con Vercel

Estado: completado y archivado en `completed/`. No cubre IDs `MVP-NNN` ni cambia el plan maestro.

## Objetivo

Que los agentes puedan instalar en la raíz el `.env` que adjunta el usuario (o cuya ruta facilita) **sin leer ni imprimir su contenido**, con un único archivo local `.env` (no `.env.local`), y dejar documentado cómo se alinean los nombres de variables entre local y Vercel.

## Decisiones locales

- Next carga `.env*` de la raíz con precedencia `process.env` > `.env.$NODE_ENV.local` > `.env.local` (no en `test`) > `.env.$NODE_ENV` > `.env` (guía en `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`). Un `.env.local` o similar **sobrescribiría** a `.env`. Por eso un guard falla si existe alguno de esos archivos; solo comprueba nombres, no los lee, mueve ni borra.
- Copia con `fs.copyFileSync(..., COPYFILE_EXCL)`: no lee el contenido, no sobrescribe un `.env` existente, no ejecuta `git add`. `.gitignore` no se relaja (`.env*` sigue ignorado, incluido `.env.local`).
- Guard ligado a `predev`, `prebuild` y `prestart`; como Playwright (proyecto `next`) arranca `npm run dev`, también lo cubre. Vitest no carga `.env` (doble de proveedores, sin credenciales). El preview Vite mantiene `envDir: false` y no recibe el entorno.
- Los tests que algún día necesiten credenciales reales (integración autorizada) deberán cargar `.env` de forma explícita y opt-in; no se añade esa infraestructura ahora (sin consumidor).
- Vercel: las variables se definen en Project Settings → Environment Variables (Production / Preview / Development); no se sube `.env`. No se hace ninguna acción en la nube.

## Pasos y validación

- [x] Script `scripts/env-file.mjs` (`check`, `install`) y scripts npm `env:check`, `env:install`, `predev`, `prebuild`, `prestart`.
- [x] Test de límites `tests/boundaries/env-file.test.ts` en directorios temporales con valores ficticios.
- [x] Documentación: `docs/development.md`, `README.md`, `AGENTS.md`, `docs/architecture.md`.
- [x] Validación: lint, typecheck, `npm test`, `test:boundaries`, `build` (ver informe de entrega).

## Pendiente fuera de alcance

Cargar valores en Vercel y definir las URLs de redirección de Supabase corresponde al propietario (ver `f13-deploy-and-demo.md`).

## Implementation Outcome

### Implemented

1. **Script de gestión e inspección de entorno (`scripts/env-file.mjs`):**
   - Subcomando `check` (`npm run env:check`): valida la ausencia de archivos locales que sombreen a `.env` (`.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`, `.env.development`, `.env.test`, `.env.production`) según el orden de precedencia de Next.js. Emite diagnóstico instructivo sin leer, mover ni borrar contenidos.
   - Subcomando `install` (`npm run env:install -- <ruta>`): copia el archivo `.env` proporcionado a la raíz del repositorio usando `fs.copyFileSync` con `fs.constants.COPYFILE_EXCL`. Garantiza copia directa sin leer ni imprimir contenidos, sin sobrescribir un `.env` existente (`EEXIST`) y sin ejecutar `git add`.
2. **Hooks y guardias npm en `package.json`:**
   - Enlace de `env:check` a los hooks `predev`, `prebuild` y `prestart`, protegiendo el inicio del servidor de desarrollo, build de producción y servidor de Playwright ante archivos de configuración que alteren la precedencia esperada.
3. **Tests de límites (`tests/boundaries/env-file.test.ts`):**
   - 8 tests en directorios temporales aislados verificando:
     - `check`: éxito con `.env` exclusivo, fallo inmediato ante presencia de `.env.local` o variantes de entorno.
     - `install`: copia exitosa con exclusión atómica, rechazo por destino preexistente (`EEXIST`), manejo de origen inexistente y preservación de archivos existentes.
4. **Documentación canónica alineada:**
   - Invariante de archivo local único `.env` y flujo de instalación seguro documentados en `README.md`, `AGENTS.md`, `docs/development.md` y `docs/architecture.md`.

### Deviations from Design

None. La implementación se ajustó estrictamente a las decisiones locales y de seguridad: copia sin lectura (`COPYFILE_EXCL`), comprobación de precedencia por nombres sin inspeccionar contenidos, preservación de `.gitignore` y exclusión de acciones en la nube o Vercel CLI.

### Validation

- **Revisión de código independiente:** Sesión `ses_ebb857a44ffe1IU6tT600QL62y` otorgó veredicto `PASS` independiente.
- **Validaciones automáticas ejecutadas localmente:**
  - `npm run lint`: OK (exit 0)
  - `npm run typecheck`: OK (exit 0)
  - `npm test`: OK (6 suites, 99 tests pasados)
  - `npm run test:boundaries`: OK (4 suites, 59 tests pasados, incluyendo los 8 tests de `env-file.test.ts`)
  - `npm run build`: OK (Next.js build limpio con `prebuild` exitoso)
  - `npm run env:check`: OK (exit 0 en entorno de trabajo)
  - `npm run test:e2e`: No ejecutado en esta verificación local (previsto para la integración general).
- **Seguridad e higiene de credenciales:**
  - Se verificó que `.env` permanece ignorado en `.gitignore`.
  - Se constató que ninguna herramienta o script leyó ni imprimió variables de entorno ni valores de secretos locales.

### Follow-up

- **Entrega en Git:** Autorizada por el usuario para incorporar en la primera tanda sobre `develop`; la ejecución del commit y push queda pendiente a cargo del orquestador (sin registrar SHA anticipado).
- **Configuración de Vercel y Supabase:** Definición de variables de entorno en Vercel Project Settings y configuración de URLs de redirección de autenticación en Supabase reservadas al propietario al momento del despliegue (`f13-deploy-and-demo.md`).
- **Tests con credenciales en vivo:** Si a futuro se implementan pruebas con servicios reales de Hedera o Supabase, deberán cargar `.env` de forma explícita y opt-in (sin infraestructura necesaria en P0).
