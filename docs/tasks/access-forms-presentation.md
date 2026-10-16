# Ficha de delegación: formularios de acceso (MVP-115)

**Estado: contrato y escenarios disponibles (probados con Vitest); borrador local sin Issue ni asignación.** Pendientes: referencia visual y publicación del Issue. Reglas comunes: [dashboard-presentation](dashboard-presentation.md), [frontend-delivery](../specs/frontend-delivery.md) (§2–§5, F-05, F-06) y [plan de tickets](../exec-plans/active/mvp/f11-frontend-presentation-tickets.md).

## Objetivo

Cuatro formularios como presentación con callbacks: **login, registro, solicitud de recuperación y nueva contraseña**. Sin lógica de autenticación; la conexión real es `MVP-031` (líder).

Referencias: PRD REQ-01, §11; [SH-07](../design/mvp-shared-foundations.md).

## Contrato y alcance

- Props (existen) en `src/features/auth/contracts/auth-forms.ts`: `LoginFormProps`, `RegisterFormProps`, `RecoveryRequestFormProps`, `NewPasswordFormProps` (= `AuthFormProps<TValues> { state: AuthFormState; onSubmit(values) }`). Estado y valores en `src/lib/contracts/auth-forms.ts`: `AuthFormState` = `idle` · `submitting` · `error{message|null, fieldErrors[]}` · `success{message}`; `LoginValues`, `RegisterValues`, `RecoveryRequestValues`, `NewPasswordValues`. Las reglas de contraseña **no** están en el contrato (son de `MVP-031`): el componente no las inventa.
- Escenarios (existen): `authFormScenarios` en `src/mocks/auth.ts`, con `form` y `id` (`login-idle`, `login-field-errors`, `login-submitting`, `login-error`, `register-*`, `recovery-*`, `new-password-*`). Preview: «Acceso (placeholder, MVP-115)».

**Allowlist propuesta (a confirmar en el Issue):**

1. `src/features/auth/components/login-form.tsx` y `login-form.test.tsx`
2. `src/features/auth/components/register-form.tsx` y `register-form.test.tsx`
3. `src/features/auth/components/recovery-request-form.tsx` y `recovery-request-form.test.tsx`
4. `src/features/auth/components/new-password-form.tsx` y `new-password-form.test.tsx`

Un único responsable para los cuatro (misma carpeta, archivos disjuntos). **Prohibido:** igual que [snapshot-presentation](snapshot-presentation.md) y además cualquier import de Supabase, `fetch`, `next/*`, `process`, cookies o `localStorage`.

## Aceptación

- [ ] Cada formulario tiene etiqueta visible por campo, `autocomplete` correcto (`email`, `current-password`, `new-password`) y error asociado a su campo (`aria-describedby`/`aria-invalid`).
- [ ] Envío en curso: botón deshabilitado visualmente y estado anunciado; la idempotencia real es del servidor.
- [ ] El error global se muestra tal cual lo entrega el container; **no hay lógica que distinga «cuenta existente»** ni mensajes que revelen existencia de cuentas (recuperación y registro).
- [ ] Resultado informado en recuperación/registro sin prometer más de lo que el contrato indica (p. ej. aviso de correo sin afirmar que llegó).
- [ ] La contraseña no se escribe en `console`, logs ni atributos; sin mostrarla por defecto.
- [ ] `onSubmit` se llama una vez por envío válido y con los valores del formulario; nada más.
- [ ] Teclado completo (Enter envía), foco visible y orden coherente; sin desbordamiento a 360 px.
- [ ] Sin expresiones prohibidas.
- [ ] Tests por formulario y negativos (error sin existencia de cuenta, doble clic).
- [ ] Capturas a 360 y 1280 px de los cuatro formularios en reposo y con error.

## Huecos

1. Contrato y escenarios ya existen (ver arriba).
2. El líder conectará la entrada del preview a tus formularios al integrarlos.
3. Parámetros de contraseña y mensajes de error: dependen de `MVP-031`/decisiones F1; la presentación usa los textos que el contrato provea.
4. Referencia visual no fijada.
5. Asignación: ver [índice](README.md).

## Validación y entrega

Igual que [snapshot-presentation](snapshot-presentation.md#validación-y-entrega).
