# Registro con acceso inmediato

## Objetivo y decisión

Pedido explícito: conservar el formulario y permitir registro e ingreso inmediato en `develop`, sin ramas ni delegación. Se acepta que Supabase confirme automáticamente el correo; esto no acredita pertenencia de la dirección. No se implementa verificación opcional posterior.

## Pasos

- [x] Ajustar alta para redirigir únicamente cuando el proveedor entregue una sesión.
- [x] Desactivar confirmaciones locales; verificar capacidad de configurar el proyecto remoto sin leer secretos.
- [x] Actualizar regresiones y documentación; ejecutar validación proporcional y autorrevisar el diff.

## Validación

Pruebas de Auth y containers, tipos, lint, barreras y build. Comprobar alta con sesión, ausencia de sesión, cuenta existente y errores del proveedor. Integración real solo si el entorno local está disponible y es seguro; distinguir evidencia local de remota.

## Resultado y evidencia

Implementación local cerrada. `signUp` conserva las cookies SSR y devuelve destino `/dashboard` únicamente con sesión; los rechazos son errores neutrales. Se preserva el callback antiguo para enlaces existentes y la recuperación de contraseña.

- Auth servidor: 75 pruebas aprobadas (incluidas 57 de flujos).
- Containers Auth: 16 pruebas aprobadas.
- Barreras: 69 pruebas aprobadas.
- ESLint completo, generación de tipos + TypeScript y build de producción: aprobados.
- E2E real con Supabase/Mailpit locales: 4 casos aprobados; acredita registro → sesión automática → dashboard, logout, recuperación, nueva contraseña, rutas privadas y rechazo de alta repetida/origen externo.
- Primer E2E falló porque Auth seguía con la configuración anterior; se reinició solo la pila local `galcoa` con stop/start, sin resetear la base. Se dejó activa porque ya estaba activa al iniciar.
- Se restauraron 16 paquetes faltantes con npm, desde las dependencias existentes; sin cambios en manifiesto/lockfile. Esto resolvió los errores iniciales de tipos por `pg` y `react-qr-code` ausentes.
- Autorrevisión, sin delegación por pedido expreso: no se usa cliente privilegiado, no se inicia sesión en cuentas preexistentes ni se expone una sesión en JSON. `git diff --check` aprobado.

## Pendiente de activación remota

Las herramientas Supabase disponibles no exponen actualización de configuración Auth. **No se cambió el proyecto remoto ni se desplegó código.** Desactivar Confirm email en el panel del proyecto y desplegar este cambio para habilitarlo allí. No se leyeron secretos ni archivos de entorno. Procedimiento y decisión en `docs/development.md`, «Registro con acceso inmediato».

Durante el trabajo aparecieron `design.md`, `public/galcoa-logo.svg` y `public/galcoa.svg` ajenos a esta tarea: preservados sin inspección ni modificación. Sin commits, push ni ramas.
