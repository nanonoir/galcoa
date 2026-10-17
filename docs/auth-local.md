# Auth local: flujos, buzón y límites de correo (MVP-031)

Nota dedicada de MVP-031. Contenido listo para trasladarse a una sección de [`development.md`](development.md) cuando el líder consolide esa guía.

## Flujos

| Pantalla | Ruta | Adaptador (POST JSON, origen confiable) |
| --- | --- | --- |
| Registro | `/registro` | `/api/auth/register` |
| Acceso | `/acceso` | `/api/auth/login` |
| Cierre de sesión | botón `LogoutButton` (lo monta MVP-116) | `/api/auth/logout` |
| Solicitud de recuperación | `/recuperar` | `/api/auth/recovery` |
| Nueva contraseña | `/nueva-contrasena` (exige la sesión del enlace) | `/api/auth/password` |
| Enlace del correo (GET) | — | `/api/auth/callback?flow=signup\|recovery&code=…` |

- Servidor: `src/lib/supabase/auth-flows.ts` (lógica y errores), `auth-http.ts` (origen, JSON, respuestas) y Route Handlers delgados en `src/app/api/auth/`. Presentación (`MVP-115`) y containers (`src/features/auth/containers/`) no contienen lógica de Auth.
- **Origen confiable (CSRF y enlaces de correo):** `NEXT_PUBLIC_APP_URL` (ya existe en `.env.example`) es la lista cerrada de orígenes canónicos, separados por coma (p. ej. `http://127.0.0.1:3217` local, `https://galcoa-nea.vercel.app` en Vercel). Se exige que `Origin` coincida **exactamente** en esquema, host y puerto; no se consultan `Host`, `X-Forwarded-*` ni `request.url`, y una petición sin `Origin` se rechaza (403). El `redirectTo` de los correos sale de esa lista, nunca de la petición. Si la variable falta o es inválida, los adaptadores responden 503 neutral (impedimento técnico, no «origen hostil»).
- PKCE: el `code` del enlace solo se canjea en el callback, que responde con redirección relativa a un destino de **lista cerrada** (`flow` es una clave, no una URL) y con `Referrer-Policy: no-referrer`. El enlace debe abrirse en el **mismo navegador** que lo pidió (el verificador PKCE vive en una cookie).
- Errores neutrales: acceso incorrecto, correo sin confirmar y cuenta inexistente dan el mismo mensaje; alta repetida y recuperación responden igual exista o no la cuenta. Los límites de envío (429) y la indisponibilidad (503) se informan como tales, nunca como éxito.
- `/nueva-contrasena` sin Auth disponible (o sin configuración) muestra un aviso técnico neutral; sin sesión, redirige a pedir otro enlace.
- Tras una nueva contraseña se cierra la sesión de recuperación y se pide acceso de nuevo. Tras confirmar el alta también.
- Después del acceso se navega a `/dashboard` (`AUTH_PATHS.afterLogin`), la ruta privada real integrada en PR 88. El montaje del cierre de sesión (`MVP-116`) sigue pendiente de cierre formal.

## Limitaciones conocidas (no inventadas ni ocultas)

- **La sesión de recuperación es una sesión completa.** Con `secure_password_change = false` (valor actual de `supabase/config.toml`) Supabase permite cambiar la contraseña con esa sesión sin reautenticar, y mientras el usuario no cierre sesión puede usar el resto de la aplicación. No se creó un «compartimento» propio; si se quisiera restringirla, es decisión del líder (p. ej. activar `secure_password_change`), no de este flujo.
- **Logs del callback:** `next.config.ts` configura `logging.incomingRequests.ignore` para excluir `/api/auth/callback` del log de peticiones de `next dev`, evitando registrar su query con `code`. Las demás rutas conservan sus logs. Esta opción solo afecta al servidor de desarrollo: no cubre los logs externos de Vercel, proxies u otras plataformas ni garantiza que allí no se registre la URL; deben configurarse por separado. La aplicación no registra el código.
- Los límites de correo y Mailpit son de la instancia local; el correo real y el proyecto remoto no se probaron aquí.

## Prueba real local (E2E)

Configuración versionada necesaria (`supabase/config.toml`, aprobada por el líder para esta prueba): `[local_smtp] enabled = true` (Mailpit, puerto 54324), `[auth.email] enable_confirmations = true`, `site_url` y `additional_redirect_urls` con `http://127.0.0.1:3217`, `[auth.rate_limit] email_sent = 10`. La confirmación de correo **no** se desactiva ni se usa auto-verificación de administrador.

```bash
npx supabase start          # propia del proyecto (project_id galcoa); la detiene quien la arrancó
npm run test:e2e:auth       # tests/server/auth-flow/run-local-auth.mjs
npx supabase stop
```

- `test:e2e:auth` lee URL y clave pública **efímeras** de `supabase status` dentro del proceso y las pasa al hijo por entorno: no se imprimen, no se escriben y no se lee ningún `.env`. Si la pila o Mailpit no responden, **falla** con el motivo.
- La suite usa su propio servidor Next en el puerto 3217 (`tests/e2e/auth.config.ts`) con `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3217`; no usa 3100 ni 4173. Trazas, capturas y vídeo están desactivados (contendrían credenciales de prueba).
- `AUTH_E2E=1` es opt-in explícito: sin él, `npx playwright test -c tests/e2e/auth.config.ts` omite la suite y lo dice (no acredita nada); con él, faltar cualquier dato es un **error de configuración** (`tests/server/auth-flow/e2e-env.test.ts`), nunca un skip.
- Cubre: registro → buzón local → confirmación → acceso → guarda de sesión (`/nueva-contrasena`, pues aún no hay ruta privada: `MVP-116`) → cierre de sesión → recuperación → enlace → nueva contraseña → acceso, respuestas uniformes y rechazo de origen y destinos externos. Correo solo ficticio y solo al Mailpit local.
- No forma parte de `npm test`, `npm run test:e2e` ni del CI.

## Límites del emisor de correo integrado

El emisor integrado de Supabase está pensado para pruebas: PRD §0 lo documenta con **2 correos por hora** en el proyecto remoto. Por eso en demo y remoto se usan cuentas precreadas (`MVP-133`) o SMTP propio (posterior); no se baja la confirmación de correo. Cuando se alcanza el límite, la API responde 429 y la pantalla muestra «Se alcanzó el límite de envíos de correo…». El valor 10/hora de `config.toml` es solo de la instancia local.

## Pendiente

- Correo real y proyecto remoto: no probados (`MVP-026`/`MVP-133`).
- Navegación a ruta privada real y montaje de `LogoutButton`: `MVP-116`.
