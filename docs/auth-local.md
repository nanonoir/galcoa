# Auth local: flujos, buzón y límites de correo (MVP-031)

Nota dedicada de MVP-031. Contenido listo para trasladarse a una sección de [`development.md`](development.md) cuando el líder consolide esa guía.

## Flujos

| Pantalla | Ruta | Adaptador (POST JSON, mismo origen) |
| --- | --- | --- |
| Registro | `/registro` | `/api/auth/register` |
| Acceso | `/acceso` | `/api/auth/login` |
| Cierre de sesión | botón `LogoutButton` (lo monta MVP-116) | `/api/auth/logout` |
| Solicitud de recuperación | `/recuperar` | `/api/auth/recovery` |
| Nueva contraseña | `/nueva-contrasena` (exige la sesión del enlace) | `/api/auth/password` |
| Enlace del correo (GET) | — | `/api/auth/callback?flow=signup\|recovery&code=…` |

- Servidor: `src/lib/supabase/auth-flows.ts` (lógica y errores), `auth-http.ts` (origen, JSON, respuestas) y Route Handlers delgados en `src/app/api/auth/`. Presentación (`MVP-115`) y containers (`src/features/auth/containers/`) no contienen lógica de Auth.
- PKCE: el `code` del enlace solo se canjea en el callback, que responde con redirección relativa a un destino de **lista cerrada** (`flow` es una clave, no una URL) y con `Referrer-Policy: no-referrer`. El enlace debe abrirse en el **mismo navegador** que lo pidió (el verificador PKCE vive en una cookie).
- Errores neutrales: acceso incorrecto, correo sin confirmar y cuenta inexistente dan el mismo mensaje; alta repetida y recuperación responden igual exista o no la cuenta. Los límites de envío (429) y la indisponibilidad (503) se informan como tales, nunca como éxito.
- Tras una nueva contraseña se cierra la sesión de recuperación y se pide acceso de nuevo. Tras confirmar el alta también.
- Después del acceso se navega a `/` (`AUTH_PATHS.afterLogin`); `MVP-116` lo apuntará a la ruta privada real.

## Prueba real local (E2E)

Requisitos mínimos de la instancia local, **a cargo del líder** (`supabase/config.toml` es global):

1. `[auth.email] enable_confirmations = true` (hoy está en `false`). No se desactiva la confirmación por defecto del producto.
2. `site_url` y `additional_redirect_urls` incluyen el origen de la suite (`http://127.0.0.1:3217`); si no, Supabase ignora `redirectTo`.
3. Límite de correos de la instancia suficiente para la suite (`[auth.rate_limit] email_sent`; la suite envía 2 correos y 1 alta repetida).
4. Buzón local (`[local_smtp]`, Mailpit, puerto 54324 por defecto).

```bash
npx supabase start
# valores de `npx supabase status`; no se leen de .env
AUTH_E2E_SUPABASE_URL=http://127.0.0.1:54321 \
AUTH_E2E_PUBLISHABLE_KEY=<clave pública efímera> \
AUTH_E2E_MAIL_URL=http://127.0.0.1:54324 \
npx playwright test -c tests/e2e/auth.config.ts
```

La suite usa su propio puerto (`AUTH_E2E_PORT`, 3217 por defecto) y su propio servidor Next; sin las variables queda **omitida**, no simulada.

## Límites del emisor de correo integrado

El emisor integrado de Supabase está pensado para pruebas: PRD §0 lo documenta con **2 correos por hora** en el proyecto remoto. Por eso en demo y remoto se usan cuentas precreadas (`MVP-133`) o SMTP propio (posterior); no se baja la confirmación de correo. Cuando se alcanza el límite, la API responde 429 y la pantalla muestra «Se alcanzó el límite de envíos de correo…».

## Pendiente

- Correo real y proyecto remoto: no probados (`MVP-026`/`MVP-133`).
- Navegación a ruta privada real y montaje de `LogoutButton`: `MVP-116`.
