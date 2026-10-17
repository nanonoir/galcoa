# Despliegue en VPS con Docker

GALCOA+ corre como un único contenedor (`galcoa-web`, Next.js `standalone`) en `/srv/onflowlabs/apps/galcoa`, publicado solo en `127.0.0.1:3001`. Cloudflare Tunnel (configurado aparte) expone `https://galcoa.noirnahuel.com` → `http://127.0.0.1:3001`. Supabase, Groq, Gemini y Hedera Testnet son externos: no hay base local.

Límites: 768 MB de RAM (sin swap extra), 1 vCPU, heap de Node 512 MB, logs rotados (3 × 10 MB). No toca redes ni contenedores existentes (proyecto Compose `galcoa`).

## 1. Variables de entorno

```bash
cd /srv/onflowlabs/apps/galcoa
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production   # completar valores reales
```

- `.env.production` está en `.gitignore` y `.dockerignore`: nunca entra a git ni a la imagen.
- `NEXT_PUBLIC_*` se incrustan en el JS del navegador **en el build**; por eso Compose los pasa como build args. Si cambian, hay que reconstruir (`--build`). Son públicos por diseño; nunca pongas un secreto con prefijo `NEXT_PUBLIC_`.
- Los demás (`SUPABASE_SECRET_KEY`, `GALCOA_EXECUTOR_DATABASE_URL`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `HEDERA_*`) solo se leen en runtime vía `env_file`; basta reiniciar.
- `NEXT_PUBLIC_APP_URL=https://galcoa.noirnahuel.com` es obligatorio: las rutas de Auth rechazan (403) peticiones cuyo `Origin` no esté en esa lista.
- Usa siempre `--env-file .env.production` con `docker compose` para que los build args se resuelvan.
- Para validar el Compose usa `docker compose --env-file .env.production config --quiet`: sin `--quiet` imprime todos los secretos en pantalla.
- `NEXT_PUBLIC_SUPABASE_URL` es la URL base del proyecto (`https://<ref>.supabase.co`), sin `/rest/v1/`.

## 2. Primer despliegue

```bash
cd /srv/onflowlabs/apps
git clone <url-del-repo> galcoa && cd galcoa
git checkout main
# crear .env.production (paso 1)
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose ps                         # esperar "healthy"
curl -fsS http://127.0.0.1:3001/api/health  # {"status":"ok"}
```

## 3. Actualización

```bash
cd /srv/onflowlabs/apps/galcoa
docker tag galcoa-web:latest galcoa-web:previous   # respaldo para rollback
git pull --ff-only
docker compose --env-file .env.production up -d --build
docker compose ps && curl -fsS http://127.0.0.1:3001/api/health
docker image prune -f
```

## 4. Logs y estado

```bash
docker compose logs --tail=200 galcoa-web
docker compose logs -f --since=10m galcoa-web
docker stats --no-stream galcoa-web
docker inspect --format '{{.State.Health.Status}}' galcoa-web
```

## 5. Rollback

```bash
cd /srv/onflowlabs/apps/galcoa
GALCOA_TAG=previous docker compose --env-file .env.production up -d --no-build
# luego, para dejar el código coherente:
git log --oneline -5 && git checkout <commit-anterior>
```

Detener sin borrar nada: `docker compose stop`. No uses `docker compose down -v` ni `docker system prune -a` en el VPS (afectaría a otras apps).

## 6. Dominio: Supabase Auth y callbacks

En el panel de Supabase → Authentication → URL Configuration (no se cambia desde el repo):

- **Site URL:** `https://galcoa.noirnahuel.com`
- **Redirect URLs:** agregar `https://galcoa.noirnahuel.com/api/auth/callback**` (el código arma `<origen>/api/auth/callback?flow=...`, p. ej. recuperación de contraseña).

Los enlaces de confirmación (`/confirm/<token>`) se generan con el origen del navegador, así que funcionan con el dominio nuevo sin cambios.

**Mercado Pago:** el código actual no tiene integración ni webhooks (pagos están fuera de P0); no hay nada que configurar.

## 7. Healthcheck

`GET /api/health` → `200 {"status":"ok"}`. No requiere sesión ni llama a servicios externos; solo indica que el proceso Node responde.
