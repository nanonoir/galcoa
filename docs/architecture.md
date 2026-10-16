# Arquitectura: aplicación única y colaboración por presentación

**Decisión técnica:** conservar una aplicación Next.js 16 con `src/` y npm. El líder integra rutas, contratos y servidor; el colaborador comienza con componentes de presentación autocontenidos. Esta separación permite trabajar antes de tener backend sin construir un producto ficticio ni exponer servicios al navegador.

Este documento es la fuente de decisiones arquitectónicas. El [PRD v1.5](exec-plans/GALCOA-PRD-v1.4.md) conserva la autoridad sobre producto. Se implementó la base de contratos, preview y herramientas de colaboración; las rutas e integraciones de producto del árbol objetivo siguen pendientes. La evidencia de preparación se registra en su plan.

## Estado actual (verificado el 2026-10-16)

| Área | Hoy |
| --- | --- |
| `src/app/` | Layout, página plantilla, CSS global y favicon; sin rutas funcionales del producto |
| UI | shadcn `base-nova` en `src/components/ui/`, hook `use-mobile`; `src/lib/utils.ts` reexporta `cn`, que está en uso |
| Configuración | Next 16.4.2, React 19, React Compiler, Tailwind v4, alias `@/*` → `src/*` |
| Dependencias | SDK de Supabase, IA, PDF y Hedera instalados; no constituyen integraciones implementadas |
| Verificación | Vitest para contratos/componentes/barreras y Playwright para Chromium; CI base verificado en GitHub Actions Linux ([f00-integracion-base-ci](exec-plans/completed/f00-integracion-base-ci.md)), suites completas de servidor/RLS y protección de ramas futuras |
| Base compartida | Contratos Zod de dashboard, escenarios en `src/mocks/`, presentación mínima de referencia y preview Vite aislado |
| Ausencias de producto | Auth, persistencia, agentes, PDF, Hedera, rutas funcionales y migraciones; los tests actuales no acreditan esos flujos |
| Entorno | Node 24.18.0, npm >=11 y plantilla `.env.example` sanitizada versionable; archivos locales privados ignorados, sin inspeccionar secretos |

No se deduce seguridad ni funcionamiento por la presencia de un SDK. Las desviaciones conocidas están en la [deuda técnica](exec-plans/tech-debt-tracker.md); sus resultados de auditoría son históricos, no checks ejecutados en esta definición.

## Árbol objetivo y propiedad

Son ubicaciones concretas cuando hagan falta, no carpetas vacías que deban crearse de antemano. Se mantienen los dominios del PRD §13 y el shadcn existente.

| Ubicación | Responsabilidad / propiedad inicial |
| --- | --- |
| `src/app/(marketing)/`, `(auth)/`, `(app)/dashboard/`, `(app)/documents/[id]/` | Composición, navegación y carga autorizada; líder |
| `src/app/confirm/[token]/`, `verify/[reference]/`, `api/` | Accesos públicos separados y adapters HTTP; líder |
| `src/features/{dashboard,chat,documents,corroborations}/components/` | Presentación por dominio; candidato colaborador **solo para archivos autorizados por ticket** |
| `src/features/<dominio>/components/*.test.tsx` | Tests de presentación junto al componente; mismo alcance del ticket |
| `src/features/<dominio>/fixtures/` | Casos ficticios locales de presentación, validados contra contrato; colaborador si están autorizados |
| `src/features/<dominio>/containers/` | Client containers: interacción, peticiones y adaptación de resultados; líder |
| `src/components/ui/`, `src/hooks/` | Primitivas y hooks compartidos; líder, para evitar colisiones |
| `src/app/layout.tsx`, `globals.css`, `public/`, configuración y manifiestos npm | Superficie compartida; líder salvo autorización concreta |
| `src/lib/contracts/` | Esquemas Zod y DTO serializables compartidos; líder |
| `src/lib/supabase/` | Clientes de sesión, acceso privado y persistencia; líder |
| `src/lib/ai/` | Orquestación Gemini/Groq, extracción y trazabilidad; líder |
| `src/lib/rules/` | Reglas y estados deterministas; líder |
| `src/lib/documents/` | Coordinación de revisión, finalización, PDF, manifiesto y hashes; líder |
| `src/lib/hedera/` | Envío HCS Testnet y reconciliación; líder |
| `src/mocks/` | Escenarios compartidos de contratos y dobles de proveedores, solo tests/preview; líder |
| `tests/{contracts,boundaries,server,e2e}/` | Pruebas transversales, barreras e invariantes; líder |
| `supabase/migrations/`, `.github/`, configuración de tests y preview | Persistencia, proceso y herramientas; líder |

El dueño técnico inicial es `@nanonoir`. No se presupone el handle del colaborador. Esta propiedad organiza el trabajo, no sustituye permisos de GitHub ni controles de seguridad. Una excepción de alcance necesita autorización explícita; no se delega toda una feature porque una parte de su presentación esté autorizada.

## Dependencias permitidas y barreras

```text
Server page / Route Handler → servicios lib/* → persistencia / proveedores
Server page → DTO serializable → Client container → componentes de presentación
Client container → endpoint real → autorización + validación del servidor
presentación → contracts + components/ui + utilidades de presentación permitidas
servicios → contracts + rules (no UI)
tests / preview local → presentación + escenarios ficticios
```

- `app/` es composición y adapter: no concentra reglas, generación de PDF ni reconciliación. Los Route Handlers validan solicitudes y autorización, llaman servicios y transforman errores. Las lecturas de Server Components reutilizan servicios directamente: no hacen HTTP contra la propia aplicación.
- `lib/contracts/` no importa React, Next, SDK, entorno, servidor ni módulos de UI. Expone esquemas de entrada/salida y sus tipos; no clientes de base de datos ni tipos de SDK. DTO de JSON con fechas explícitas como strings, sin instancias `Date`, `File`, `Buffer`, funciones o clases de proveedores.
- La presentación recibe datos y callbacks; conserva solo estado visual local. No importa `app/`, containers, mocks compartidos, servicios, SDK ni variables de entorno; no hace `fetch`, autorización, persistencia ni cálculo de autoridad de negocio. Puede formatear valores sin cambiar su significado.
- Los Client containers poseen peticiones y estados de interacción; no usan claves ni SDK de servidor. Un Server Component pasa DTO al container; los callbacks ordinarios nacen en el container cliente, **no se pasan funciones ordinarias de servidor a cliente**. No se introduce Server Actions para resolver este límite.
- Los módulos que acceden a secretos, persistencia privada, IA, PDF/finalización o HCS llevan `import "server-only"`. Un cliente Supabase para Auth de navegador, si se necesita después, es una entrada explícita separada que solo usa configuración pública; no justifica importar Supabase desde presentación.
- Reglas ESLint de imports restringidos según carpeta y tests de barrera impiden escapes por rutas relativas, alias, reexports o helpers intermedios. Las utilidades puras permitidas son una lista pequeña, no todo `lib/`. Las pruebas de reglas usan casos positivos y negativos; lint y barrera de build complementan `server-only`.

Se evita crear repositorios genéricos, un bus de eventos, capas `framework/infrastructure` o interfaces de proveedores sin consumidor concreto. La separación presentación/container y servicios por dominio resuelve la colaboración sin una segunda aplicación ni un rediseño global.

## Contratos y puntos de integración

El líder fija antes de cada delegación los props, esquema DTO, callbacks y escenarios observables. Contrato de componente no implica API HTTP estable: los endpoints se definen al integrar y no los inventa el colaborador. Los tests validan fixtures con Zod, no solo con aserciones de tipos.

| Frontera | Contenido y autoridad |
| --- | --- |
| Dashboard | Lista y estados informados por servidor; navegación/crear son callbacks, no mutaciones simuladas |
| Revisión | Identidad de documento/revisión, snapshot congelado completo, advertencias y estados independientes del PRD §5; no derivar «aprobado» a partir de la ausencia de advertencias |
| Confirmaciones | Selección y respuestas ligadas a revisión/snapshot; disponibilidad y resultado de una acción provienen del servidor, que revalida siempre |
| Historial | Registros/versiones y reportes persistidos de solo lectura; no reconstrucción histórica con una nueva llamada a IA |
| Versión final y HCS | IDs, referencias y estados separados: finalización y sello pendiente pueden coexistir; UI no produce hashes, PDF final, confirmaciones ni registro HCS |
| Público | DTO mínimo específico para invitación o verificador; no reutilizar un DTO privado con chat/evidencias y ocultarlo por CSS |

Los DTO distinguen carga/error de transporte, advertencias informativas e impedimentos de etapa. No se añaden estados de producto ni UX a partir de necesidades del mock. La finalización se coordina en servidor con revisión congelada y todas las confirmaciones; cambios materiales o selección nueva no heredan respuestas (INV-11–18). El rechazo y los permisos no se implementan como mera deshabilitación de un botón.

Flujo futuro: evento del usuario → container → Route Handler autorizado → servicio y persistencia → DTO validado → nueva presentación. El servidor conserva autoridad e idempotencia aun si se manipulan los props o se repite una petición. No hay finalización mock en una ruta de producto ni fallback silencioso cuando falla un servicio.

## Preview local sin credenciales

**Decisión:** usar un entrypoint dedicado de desarrollo, fuera de `src/app/`, servido por Vite únicamente en loopback. Reutiliza React, el CSS existente y componentes reales con escenarios ficticios; no emula Next, Auth ni backend. Evita rutas mock de producto que puedan desplegarse por accidente y permite revisar presentación sin login ni credenciales.

- El líder mantiene `preview/index.html`, configuración Vite y un selector de escenarios con imports explícitos de las presentaciones autorizadas. No se escanea automáticamente el árbol de servidor.
- Comando `npm run preview:ui`: servidor local de desarrollo; no exportación estática, no script de build de preview, no artefacto de despliegue. La configuración rechaza modo no-development y no expone el servidor a la red.
- Configurar Vite sin carga de archivos de entorno (`envDir: false`), sin prefijos de variables públicas y sin reemplazar `process.env` por el entorno del proceso. No usar sus valores para resolver escenarios.
- Callbacks del harness muestran únicamente eventos locales de demostración; no persisten, no llaman red ni fabrican una confirmación/finalización real. Indicador visible de datos ficticios y pérdida de estado al recargar.
- Escenarios canónicos en `src/mocks/`, fixtures de un componente en su feature; ambos validan el DTO. La UI productiva nunca importa fixtures. Los mocks de IA/HCS/persistencia son exclusivos de tests de servidor y no se incluyen en el preview.
- Un smoke de arranque confirma render sin credenciales; un check de imports evita servidor/proveedores en preview. El build Next no contiene rutas de preview ni consumidores de fixtures.

Alternativas descartadas: Storybook añade infraestructura desproporcionada para un colaborador inicial; una ruta Next pública con datos fake arriesga despliegue accidental; solo tests de componentes no permite inspección manual/capturas. El preview no reemplaza el smoke posterior de integración real en Next (navegación, Server Components y estilos completos).

## Herramientas de la base y próximas integraciones

Contratos del primer ticket y herramientas ya incorporados. Los consumidores reales de servicios y sus pruebas se implementarán con cada funcionalidad. El CI base de Linux está comprobado verde en GitHub Actions ([f00-integracion-base-ci](exec-plans/completed/f00-integracion-base-ci.md)); la protección de ramas y suites ampliadas de servidor/RLS permanecen futuras (MVP-131).

| Área | Decisión y criterio |
| --- | --- |
| Contratos | Zod instalado; esquemas acotados a cada entrega. No diseñar todo el modelo de datos antes de la primera UI |
| Tests | Vitest, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event` y jsdom; entorno DOM para presentación, Node para contratos/servicios. Setup y configs del líder |
| Scripts | `test` ejecuta Vitest una vez sin watch; `test:watch` solo local; `test:boundaries` para restricciones; `test:e2e` ejecuta Playwright; `preview:ui` para inspección manual |
| CI | GitHub Actions con Node LTS compatible fijado y documentado, `npm ci`, lint, tipos, tests/barreras y build; sin secretos ni servicios externos. Misma versión Node local/CI; lockfile versionado |
| Build sin credenciales | SDK/configuración de servidor solo se inicializan al atender una operación real. Nunca prerenderizar datos privados ni llamar proveedores durante build; ausencia de configuración da error técnico explícito al usar la operación, no datos ficticios |
| Navegador/E2E | Playwright desde la preparación: Chromium para render/interacciones del preview y smoke de Next; ampliar flujos E2E al implementar rutas reales. Vitest cubre unidades y componentes síncronos; no componentes de servidor asíncronos. Las pruebas browser no sustituyen pruebas de permisos/RLS |
| Providers PRD | Mantener Next/npm/Supabase/PDF/Hedera; `ai`, `@ai-sdk/react`, `groq-sdk` y `server-only` instalados (D-05); sin consumidores ni agentes implementados |
| Limpieza acotada | Revisar usos antes de retirar `@ai-sdk/groq`, agent kits o pagos fuera de P0; instalación sola no viola INV-04. No retirar `cn` ni dependencias UI utilizadas; no actualizar mayores o aplicar fixes forzados ajenos |
| Entorno | Crear una `.env.example` sanitizada **desde los nombres del PRD §13**, sin copiar archivos locales; valores vacíos salvo `HEDERA_NETWORK=testnet`. Añadir `!.env.example` después de `.env*`. Nombres definitivos se verifican contra el consumidor; claves privilegiadas que se necesiten después siguen solo servidor |

Las pruebas iniciales verifican contratos, barreras y presentación, no acreditan REQ-18 completo. Las pruebas deterministas críticas del PRD §12 se incorporan con su funcionalidad; la evaluación de IA sigue separada y no condiciona cada PR. Auditoría de dependencias se registra por separado: una advertencia dev conocida no se oculta ni se resuelve con downgrades forzados.

## Condición para delegar y primeros candidatos

Un ticket frontend está listo solo si existen contrato y escenarios validados, preview sin credenciales, pruebas reproducibles, barreras activas y allowlist de archivos revisada por el líder. Poder trabajar con mocks **no significa** que el producto esté integrado ni que cualquier pantalla pueda delegarse.

| Candidato inicial | Dependencias de preparación y límite |
| --- | --- |
| Dashboard vacío/lista con estados | DTO de resumen, fixtures y callbacks de abrir/crear definidos. Solo presentación; sin CRUD, rutas o sesión |
| Visualización de snapshot y advertencias | Contrato de revisión congelada y dimensiones independientes; contenido completo y fuentes de advertencias. Sin selección, confirmar o finalizar |
| Historial de versiones | DTO histórico y estados finalización/HCS; lectura y callback de selección. Sin regenerar reportes, PDF o reintentar sello |

El dashboard puede ser la primera entrega; snapshot e historial pueden seguir cuando sus contratos estén cerrados y sin archivos compartidos en conflicto. Auth, chat interactivo y confirmación pública son integraciones sensibles, no primeras tareas sencillas; su presentación podrá separarse después con alcance y contratos propios. Esto no cambia el orden de producto del PRD.

Cada Issue de delegación referencia requisito y plan aplicable, contrato, escenarios, allowlist, archivos prohibidos, callbacks/API permitida, criterios verificables, pruebas y capturas esperadas. Spec o diseño adicional solo si elimina ambigüedad. Rama corta y PR con evidencia; el líder revisa e integra. El trabajo propio del líder no requiere crear Issues para cada paso.

Templates de Issue/PR y `CODEOWNERS` están en `.github/` como ayuda de proceso, no enforcement remoto comprobado. `@nanonoir` revisa el repositorio sin inventar identidad del colaborador; la allowlist del ticket sigue siendo más fina que CODEOWNERS. Requerir checks/revisión mediante branch protection es configuración de GitHub aparte que debe verificarse, no algo que se active al agregar el archivo.

## Decisiones que permanecen abiertas

- Esquemas y props exactos de cada entrega: afectan su delegación, no la separación de capas aquí decidida.
- Detalles pendientes del PRD §16 (adjuntos, tokens, canonicalización/reconciliación HCS, modelos/costos y revisión jurídica): afectan integraciones futuras, no habilitan inventar comportamiento desde UI.
- Handle/permisos del colaborador y configuración efectiva de protección de ramas: afectan asignación/enforcement de proceso, no propiedad técnica inicial.

## Referencias

[PRD §8 Persistencia y §9 Hedera](exec-plans/GALCOA-PRD-v1.4.md) · [Desarrollo](development.md) · [Índice](README.md)
