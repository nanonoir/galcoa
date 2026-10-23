# Evidencia visual del onboarding (2026-10-23)

Capturas del preview local (`npm run preview:ui`, datos ficticios) de las pantallas que cambió el
[plan de onboarding](../../exec-plans/active/onboarding-flujo-usuario.md), a **360 px** (celular) y
**1280 px** (escritorio). Ninguna tiene desborde horizontal (`scrollWidth − clientWidth = 0` en todas).

| Pantalla | Escenario | 360 px | 1280 px |
| --- | --- | --- | --- |
| Panel (MVP-111) | Lista vacía: 4 pasos alineados con la guía de activación | [ver](evidence/dash-lista-vacia-360.png) | [ver](evidence/dash-lista-vacia-1280.png) |
| Panel | Confirmaciones pendientes: «Te falta» | [ver](evidence/dash-confirmaciones-pendientes-360.png) | [ver](evidence/dash-confirmaciones-pendientes-1280.png) |
| Panel | Entrega comercial contradictoria (10 vs 12) | [ver](evidence/dash-entrega-comercial-contradictoria-10-vs-1-360.png) | [ver](evidence/dash-entrega-comercial-contradictoria-10-vs-1-1280.png) |
| Panel | Finalizada con registro en Hedera | [ver](evidence/dash-finalizada-con-sello-hcs-registrado-360.png) | [ver](evidence/dash-finalizada-con-sello-hcs-registrado-1280.png) |
| Versión congelada (MVP-112) | Contradicción crítica con dos fuentes | [ver](evidence/snap-contradiccion-critica-con-dos-fuentes-10-360.png) | [ver](evidence/snap-contradiccion-critica-con-dos-fuentes-10-1280.png) |
| Versión congelada | Sin advertencias | [ver](evidence/snap-sin-advertencias-360.png) | [ver](evidence/snap-sin-advertencias-1280.png) |
| Historial (MVP-113, Issue #28) | Error técnico recuperable | [ver](evidence/hist-error-tecnico-recuperable-360.png) | [ver](evidence/hist-error-tecnico-recuperable-1280.png) |
| Historial | Sin versiones finalizadas | [ver](evidence/hist-sin-versiones-finalizadas-360.png) | [ver](evidence/hist-sin-versiones-finalizadas-1280.png) |
| Historial | Una versión con registro | [ver](evidence/hist-una-version-con-sello-registrado-360.png) | [ver](evidence/hist-una-version-con-sello-registrado-1280.png) |
| Historial | v1 registrada y v2 pendiente | [ver](evidence/hist-v1-registrada-y-v2-con-sello-pendiente-360.png) | [ver](evidence/hist-v1-registrada-y-v2-con-sello-pendiente-1280.png) |
| Historial | Registro fallido (versión finalizada) | [ver](evidence/hist-sello-fallido-version-finalizada-360.png) | [ver](evidence/hist-sello-fallido-version-finalizada-1280.png) |

## Ajustes hechos a partir de estas capturas

- Panel vacío: había **dos botones principales** para la misma acción; el de adentro del bloque pasó a secundario.
- Versión congelada: el título decía «Snapshot congelado»; ahora dice «Versión congelada».

## Límites

- El preview no tiene entradas para el chat, la revisión, la pantalla del comercio ni la tarjeta sellada: esas
  pantallas no se capturaron (ticket N-5 del plan). Sus textos están cubiertos por tests de componentes.
- Los fixtures del preview son snapshots v1: por eso la versión congelada muestra «Autor» (las etiquetas v1 se
  conservan a propósito; los snapshots v2 muestran «Proveedor»). Fixtures v2 también en N-5.
- Los nombres de escenario del preview («sello HCS») son rótulos de desarrollo, no texto de la aplicación.
