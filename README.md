<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/galcoa-on-navy.svg">
  <img src="public/galcoa.svg" alt="GALCOA+" width="280">
</picture>

### Cada entrega cuenta. Hacé que también te respalde.

GALCOA+ es para distribuidoras de alimentos y bebidas que ya trabajan bien y quieren poder demostrarlo. Registrás la entrega por chat, el comercio la confirma con un enlace o QR y la **huella del documento queda registrada en Hedera**.

[![Checks](https://github.com/nanonoir/galcoa/actions/workflows/ci.yml/badge.svg)](https://github.com/nanonoir/galcoa/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%C2%B7%20Postgres%20%C2%B7%20Storage-3FCF8E?logo=supabase&logoColor=white)
![Hedera](https://img.shields.io/badge/Hedera-HCS%20Testnet-174235)
![Node](https://img.shields.io/badge/Node-24.18-339933?logo=nodedotjs&logoColor=white)

**[Demo en vivo](https://galcoa.noirnahuel.com)** · [Evidencia](#-demo-y-evidencia) · [Cómo funciona](#-cómo-funciona) · [Estado real](#-estado-real) · [Hoja de ruta](#️-hoja-de-ruta) · [Instalación](#-instalación-local) · [Despliegue](#-despliegue) · [Testing](#-testing) · [Documentación](#-documentación)

</div>

---

## 🎯 El problema

Una distribuidora puede trabajar bien durante años y no poder demostrarlo:

- Remitos, planillas y mensajes de WhatsApp desparramados.
- Reclamos sin respaldo: cuando hay un problema con una entrega, nadie puede probar qué pasó.
- Todo es «palabra de la distribuidora», sin un tercero que lo confirme.
- Cuesta convertir un buen desempeño en argumentos para conseguir marcas nuevas.

GALCOA+ convierte cada entrega en un registro con respaldo. Con el tiempo, esos registros son la base de la **reputación** de la distribuidora.

## 👥 Para quién es

| Rol | Quién es | Qué hace en GALCOA+ |
| --- | --- | --- |
| **Cliente** | Distribuidoras pequeñas y medianas de alimentos y bebidas; el comienzo es Corrientes y el NEA | Registra sus entregas y arma su historial |
| **Comercio** | El almacén o negocio que recibe la mercadería | Confirma la entrega con un enlace o QR, sin crearse una cuenta |
| **Marca** | La empresa que evalúa a la distribuidora | Verá lo que la distribuidora decida compartir (**futuro**) |

No competimos con un ERP, con sistemas de GPS ni con plataformas de cumplimiento: GALCOA+ es simple y específico.

## 🎬 Demo y evidencia

- **[Demo en vivo](https://galcoa.noirnahuel.com)** (Hedera Testnet).
- Registro real en Testnet, comprobable en el mirror node público (solo lectura):

| Dato | Valor |
| --- | --- |
| Topic HCS | [`0.0.11047482`](https://hashscan.io/testnet/topic/0.0.11047482) |
| Secuencia | `10` |
| Marca de tiempo de consenso | `1792475461.380470070` |
| Hash del manifiesto | `4d79777dc1f40b4d32ad540c11bd99ce36964f27e06018d9126dea5c12c5f311` |
| Referencia opaca | `b3357344164340c5b1c72712adaa97a3` |

El mensaje publicado contiene solo `manifestHash`, `reference` y `schemaVersion`. Se puede leer con:

```bash
curl https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11047482/messages/10
```

> El hash del manifiesto **no** es el hash del PDF: es la huella del manifiesto canónico que referencia al PDF final. Es un registro de **Testnet**, una red de práctica que puede reiniciarse.

## 🧭 Cómo funciona

```mermaid
flowchart LR
    A[💬 Registrás la entrega por chat] --> B[🤖 Borrador con IA]
    B --> C[👀 Revisás el documento]
    C --> D[🔗 El comercio confirma por enlace o QR]
    D --> E[⬆️ Subir Contrato: PDF final inmutable]
    E --> F[🔐 Huella en Hedera HCS]
    F --> G[🔎 Verificación pública]
```

1. **Registrá la entrega.** Contás la operación por chat y adjuntás el remito o el comprobante (fotos o PDFs). Ejemplo: «Entregué 200 cajas en el almacén». Audio: **futuro**.
2. **Revisá y obtené la confirmación.** Un borrador asistido por IA (Gemini redacta; un segundo modelo en Groq contrasta) queda congelado como una revisión. Todos los participantes elegidos confirman **esa misma revisión** por enlace; un cambio material crea otra.
3. **Respaldá tu trabajo.** *Subir Contrato* genera el PDF final inmutable y publica su huella en **Hedera Consensus Service (Testnet)**. Cualquiera puede comprobarla en `/verify/<referencia>` sin ver el contenido.

### Por qué Hedera

| Sí prueba | No prueba |
| --- | --- |
| Cuándo se registró la huella del documento | Que la entrega haya pasado de verdad |
| Que una copia con contenido distinto **ya no coincide** con esa huella | Que todo lo declarado sea cierto |

La huella **detecta** si una copia fue modificada; **no impide** que alguien edite una copia ni prueba que lo declarado sea verdadero. Por eso se suman la confirmación del comercio, el rastro auditable y la separación entre lo declarado y lo confirmado. A Hedera solo viajan **hashes e identificadores opacos**.

## ✅ Estado real

Esta tabla describe el código integrado en `develop`, no acredita que la demo remota ya esté desplegada con esa versión. La migración ALC se aplicó en `galcoa-dev`; el despliegue del runtime compatible sigue pendiente del merge y la publicación de esta entrega.

| Implementado en el código | No incluido |
| --- | --- |
| Registro e ingreso con Supabase Auth; chat con evidencias | Audio y transcripción |
| Semáforo determinista ALC: verde / amarillo / rojo; rojo bloquea finalizar y sellar también en SQL | Identidad verificada o garantía de personas distintas detrás de los enlaces |
| Borrador con Gemini, contraste con Groq y evaluación versionada enlazada al snapshot | Indicadores de desempeño y perfil para compartir con marcas |
| Revisión congelada y confirmación por enlace o QR, sin cuenta para el tercero | Indicadores de desempeño y perfil para compartir con marcas |
| PDF final inmutable y huella SHA-256 en Hedera Testnet | Audio y transcripción |
| Verificador público por referencia | Contratos inteligentes, Mainnet, cobros |

El interruptor `DEMO_HIDE_WARNINGS` puede ocultar advertencias informativas heredadas, **nunca el semáforo ALC ni sus motivos**. La separación es por rol: proveedor y comprador obligatorios, transportista opcional; el token no prueba identidad ni personas distintas. No hay datos reales de validación con clientes: las cifras y precios de [reglas de producto](docs/GALCOA-REGLAS-PRODUCTO.md) son ilustrativos.

## 🗺️ Hoja de ruta

| Fase | Qué incluye |
| --- | --- |
| **1 · Hoy** | MVP en Hedera Testnet: chat, borrador con IA, confirmación por enlace o QR, PDF final y huella |
| **2 · Piloto en el NEA** | Validación operativa con distribuidoras, indicadores y perfil compartible, Mainnet, reportes |
| **3 · Acuerdos con contratos inteligentes** | Metas y bonificaciones acordadas vinculadas a operaciones confirmadas, **sin custodia ni transferencia de fondos** |
| **4 · Otros mercados** | Integraciones y nuevos mercados |

## 💻 Qué incluye el producto hoy

GALCOA+ documenta operaciones comerciales conversando:

| | |
| --- | --- |
| 💬 **Chat + evidencias** | Contás la operación con tus palabras y adjuntás fotos o PDFs (facturas, remitos). |
| 🤖 **Redacción asistida** | Gemini extrae el texto de las pruebas y redacta un borrador estructurado. |
| 👀 **Vista previa** | Revisás el PDF antes de cerrar nada. |
| ✅ **Confirmación** | Declara el proveedor, responde el transportista si participa y confirma el comprador: todos sobre **la misma versión congelada**. |
| ⬆️ **Subir Contrato** | Se genera el PDF final (inmutable) y su huella se publica en **Hedera Consensus Service (Testnet)**. |
| 🔎 **Verificación pública** | Cualquiera puede comprobar la huella en `/verify/<referencia>` o en HashScan, sin acceder al contenido. |

## 🧱 Stack

| Capa | Tecnología |
| --- | --- |
| App | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui |
| Datos | Supabase: Auth, Postgres con RLS y funciones `SECURITY DEFINER`, Storage privado |
| IA | Gemini (extracción y redacción) · GPT-OSS 120B en Groq (contraste) · Zod para salidas estructuradas |
| Documento | `@react-pdf/renderer` · SHA-256 · manifiesto canónico (JCS) |
| Blockchain | Hedera Consensus Service con `@hiero-ledger/sdk` · Mirror Node para reconciliar · **Testnet** |
| Calidad | Vitest · Playwright · ESLint · barreras de arquitectura · GitHub Actions |
| Despliegue | Docker (Next.js `standalone`) en VPS detrás de Cloudflare Tunnel · compatible con Vercel |

## 📁 Estructura

```text
src/
├── app/                 # Rutas (App Router): páginas privadas, landing, /confirm, /verify y API
├── features/            # Por dominio: chat, corroborations, documents, dashboard, marketing, auth
│   └── <dominio>/{components,containers,contracts}
├── lib/                 # Servidor y contratos: documents, ai, hedera, supabase, contracts (Zod)
└── components/ui/       # Primitivas shadcn
supabase/migrations/     # Esquema, RLS y funciones (fuente de verdad de la base)
tests/                   # server, rls, e2e (Playwright)
preview/                 # Preview local de componentes con datos ficticios (sin credenciales)
docs/                    # PRD, arquitectura, desarrollo, planes y deuda técnica
```

Más detalle en [`docs/architecture.md`](docs/architecture.md).

## 🚀 Instalación local

### Requisitos

- **Node.js 24.18** (`.nvmrc`) y **npm ≥ 11**
- Para la base local: **Docker** y la CLI de Supabase (`npx supabase`)
- Cuentas propias (solo si querés el flujo completo): Supabase, Google AI (Gemini), Groq y una cuenta Hedera **Testnet** ([portal](https://portal.hedera.com))

### 1. Probar la interfaz sin credenciales (2 minutos)

```bash
git clone https://github.com/nanonoir/galcoa.git
cd galcoa
npm ci
npm run preview:ui
```

El preview monta los componentes reales con escenarios ficticios. No necesita `.env`, red ni servicios.

### 2. Aplicación completa con Supabase local

```bash
npx supabase start                 # Postgres, Auth y Storage locales (Docker); aplica supabase/migrations
npx supabase status                # URL y claves locales para el .env
cp .env.example .env               # completá los valores (ver tabla)
npm run dev                        # http://localhost:3000
```

La conexión del rol limitado `galcoa_exec_login` (`GALCOA_EXECUTOR_DATABASE_URL`) se provisiona aparte; seguí [Ejecutor interno](docs/development.md#ejecutor-interno-f4-provisión-privada-del-operador).

> Usá **un único** archivo `.env` en la raíz. **Nunca** `.env.local`: Next le da prioridad y `npm run env:check` lo bloquea. Si te pasan un `.env`, instalalo sin leerlo con `npm run env:install -- <ruta>`.

### Variables de entorno

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | cliente + servidor | URL base del proyecto (`https://<ref>.supabase.co`, sin `/rest/v1`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente + servidor | Clave publicable de Supabase |
| `NEXT_PUBLIC_APP_URL` | cliente + servidor | Origen de confianza de la app (p. ej. `http://localhost:3000`) |
| `SUPABASE_SECRET_KEY` | solo servidor | Operaciones de servidor de Supabase |
| `GALCOA_EXECUTOR_DATABASE_URL` | solo servidor | Conexión Postgres del rol limitado `galcoa_exec_login` (pooler en la nube) |
| `GALCOA_EXECUTOR_DATABASE_CA` | solo servidor | Certificado CA de Supabase para TLS con el pooler (obligatorio en la nube) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | solo servidor | Gemini: extracción y redacción |
| `GROQ_API_KEY` | solo servidor | Groq: contraste |
| `HEDERA_NETWORK` | solo servidor | Siempre `testnet` (otra red se rechaza) |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | solo servidor | Cuenta operadora de Testnet |
| `HEDERA_TOPIC_ID` | solo servidor | Topic HCS donde se publican las huellas |

Solo las `NEXT_PUBLIC_*` llegan al navegador. Las claves nunca van a commits, logs ni capturas.

## ☁️ Despliegue

### Opción A — Docker en un VPS (producción actual)

Guía completa: [`docs/DEPLOY-VPS.md`](docs/DEPLOY-VPS.md).

```bash
cp .env.production.example .env.production && chmod 600 .env.production   # completar valores
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
curl -fsS http://127.0.0.1:3001/api/health                                  # {"status":"ok"}
```

Checklist que evita los errores más comunes:

- [ ] **Migraciones aplicadas** en el proyecto Supabase: `npx supabase link --project-ref <ref>` y `npx supabase db push`. Si faltan funciones, la app responde `TECHNICAL_FAILURE`.
- [ ] `GALCOA_EXECUTOR_DATABASE_URL` apunta al **pooler** (`*.pooler.supabase.com:6543`, usuario `galcoa_exec_login.<ref>`), no a `db.<ref>.supabase.co`, que solo responde por IPv6.
- [ ] `GALCOA_EXECUTOR_DATABASE_CA` contiene el certificado de *Database Settings → SSL Configuration*, entre comillas dobles y con sus saltos de línea.
- [ ] Tras cambiar `.env.production`: `docker compose --env-file .env.production up -d --force-recreate` (`restart` no relee el archivo).
- [ ] En Supabase Auth, *Site URL* y *Redirect URLs* con tu dominio (`…/api/auth/callback**`).

### Opción B — Vercel

Importá el repo, cargá las mismas variables en *Project Settings → Environment Variables* y desplegá. `output: "standalone"` es ignorado por Vercel.

## 🧪 Testing

| Comando | Qué cubre | Requiere |
| --- | --- | --- |
| `npm run lint` | ESLint | — |
| `npm run typecheck` | Tipos de rutas Next + `tsc --noEmit` | — |
| `npm test` | Vitest: contratos, servicios, rutas y componentes (~1400 tests) | — |
| `npm run test:boundaries` | Barreras de imports entre capas | — |
| `npm run build` | Build de producción | — |
| `npm run test:e2e` | Playwright: preview, landing, accesibilidad y responsive | `npx playwright install chromium` |
| `npm run test:rls` | RLS, grants e inmutabilidad contra Postgres real | Docker + `npx supabase start` |
| `npm run test:server:local` | Servidor, Auth y concurrencia contra la pila local | Docker + `npx supabase start` |
| `npm run test:e2e:review` · `test:e2e:confirm` · `test:e2e:auth` | Recorridos de navegador con datos sembrados | Docker + Supabase local |

Validación rápida antes de un PR:

```bash
npm run lint && npm run typecheck && npm test && npm run test:boundaries && npm run build
```

GitHub Actions ([`ci.yml`](.github/workflows/ci.yml)) corre esos checks, Playwright y las suites seriales contra un Supabase efímero en Linux.

## 🛡️ Reglas que el código cumple hoy

Las reglas posteriores de [distribuidoras](docs/GALCOA-REGLAS-PRODUCTO.md) prevalecen sobre la autonomía del PRD histórico. La evaluación ALC y las guardas de revisiones nuevas están implementadas y probadas en Postgres local; eso no acredita el despliegue ni el recorrido completo con proveedores reales.

- **Bloqueo determinista:** pedido 200 / remito 198 es rojo y no se sella. Corregir requiere una nueva revisión y nuevas confirmaciones; no borra las fuentes originales.
- **Participantes obligatorios:** proveedor y comprador; transportista opcional. El servidor y SQL exigen el orden de respuesta, no solo la interfaz.

- **Inmutabilidad:** las versiones finalizadas, sus PDFs y hashes no se modifican ni se borran.
- **Misma versión para todos:** cada participante confirma el mismo snapshot congelado; un cambio crea otra revisión.
- **Enlaces seguros:** abrir un enlace de confirmación no lo consume; responder es atómico e idempotente.
- **Privacidad en blockchain:** a Hedera solo van hashes e identificadores opacos, y solo en Testnet.
- **Lenguaje honesto:** el sistema no emite «certificados», no ofrece «firma digital» ni «identidad verificada», y no garantiza que los datos sean verdaderos. Deja constancia de quién confirmó y de que el documento no cambió.

## ⚠️ Limitaciones del MVP

- Es una **demostración**: Hedera **Testnet** puede reiniciarse; usá datos ficticios.
- La demo puede ocultar advertencias heredadas (`DEMO_HIDE_WARNINGS`), no el semáforo ALC de snapshots v2; ver [deuda técnica §9](docs/exec-plans/tech-debt-tracker.md).
- Los enlaces de confirmación se comparten manualmente (WhatsApp, correo o QR).
- Fuera de alcance hoy: Mainnet, cobros, contratos inteligentes, audio, indicadores, perfil compartible e invitaciones automáticas.
- Evidencia de navegador: confirmación 4/4 y solo escenario comprador de revisión 1/1, con evaluación ficticia persistida por el puente Node. Otros tres escenarios de revisión no se ejecutaron en la validación focalizada. No es evidencia de IA/Hedera reales ni del despliegue remoto nuevo.

## 📚 Documentación

| Necesitás… | Leé |
| --- | --- |
| Reglas de producto vigentes (objetivo) | [`docs/GALCOA-REGLAS-PRODUCTO.md`](docs/GALCOA-REGLAS-PRODUCTO.md) · [plan de alineación](docs/exec-plans/active/alineacion-distribuidoras.md) |
| Antecedente e invariantes conservados | [PRD histórico](docs/exec-plans/GALCOA-PRD-v1.4.md) |
| Arquitectura y límites | [`docs/architecture.md`](docs/architecture.md) |
| Desarrollo, validación y seguridad | [`docs/development.md`](docs/development.md) |
| Despliegue en VPS | [`docs/DEPLOY-VPS.md`](docs/DEPLOY-VPS.md) |
| Guía visual | [`design.md`](design.md) |
| Planes y deuda técnica | [`docs/exec-plans/`](docs/exec-plans/) · [deuda técnica](docs/exec-plans/tech-debt-tracker.md) |
| Trabajar con agentes de IA | [`AGENTS.md`](AGENTS.md) |

## 👥 Equipo

Proyecto para la **Ideathon Hedera · NEA Tech 2026** (3.er puesto).

Gastón Persoglia · Nahuel Noir · Facundo Ayala · Federico Fontana · Thomas Skarp
