# Qué Issue ejecutar y en qué orden

Esta guía es para Nahuel, Gastón y Facu. Las Issues incluyen las instrucciones completas para Claude; el [maestro](../exec-plans/active/mvp-master-plan.md) conserva el progreso real. Publicar un ticket no significa que su implementación haya empezado.

## Para empezar, sin saber Git

1. Abrí la carpeta del repo en Claude Code Desktop.
2. Dale el enlace de **una** Issue y este mensaje:

   > Ejecutá esta Issue completa. Leé AGENTS.md y las referencias del ticket. Comprobá sus dependencias y encargate de la rama desde origin/develop, implementación, pruebas, commits, push, PR y merge según la política del repo. No me pidas resolver Git. Si hay dos comportamientos incompatibles, explicame las opciones y sus consecuencias con palabras muy simples y continuá con mi decisión. No leas ni muestres secretos.

3. No abras otra tarea mientras Claude siga trabajando en esa. Si espera una dependencia, que lo explique y deje anotado el bloqueo; no invente el código que falta.
4. Al terminar, Claude te da el PR/commit, qué comprobó y qué falta. Que algo esté mergeado no significa que sus pruebas hayan pasado: cualquier fallo tolerado debe quedar visible.

Si falta GitHub CLI o autenticación, Claude te guía para iniciar sesión desde el navegador, no te pide pegar contraseñas o tokens. Tener conectado el repo en Desktop no garantiza que `gh` esté autenticado.

## Facu — `@jfacundoayala`

**Podés empezar por la primera.** GitHub ya confirma tu permiso de escritura; no esperás la invitación de Gastón ni backend. Las cinco vistas tienen contratos y escenarios preparados.

| Orden | Issue | Qué entregás | Cuándo seguir |
| --- | --- | --- | --- |
| 1 | [#26](https://github.com/nanonoir/galcoa/issues/26) | Dashboard | Integrado y validado según el ticket |
| 2 | [#30](https://github.com/nanonoir/galcoa/issues/30) | Cuatro formularios visuales, sin Auth | Su entrega habilita conectar Auth a Nahuel |
| 3 | [#27](https://github.com/nanonoir/galcoa/issues/27) | Snapshot y advertencias, solo lectura | Sin esperar backend de confirmaciones |
| 4 | [#28](https://github.com/nanonoir/galcoa/issues/28) | Historial de versiones | Sin esperar versiones reales |
| 5 | [#29](https://github.com/nanonoir/galcoa/issues/29) | Landing y navegación | Luego avisar que tu carril está completo |

Una presentación activa por vez. Claude puede conectar **solo su entrada** del preview y sus pruebas: permiso acotado ya incluido en las Issues. Así ves el componente real y obtenés capturas, no JSON. Nahuel no modifica el registro simultáneamente. No implementás permisos, sesiones, base de datos, IA, PDF ni Hedera.

## Gastón — `@grancobud`

**Primero aceptá la invitación al repo.** Al preparar esta guía GitHub todavía la muestra pendiente; tus seis Issues quedan sin asignación formal hasta comprobar el acceso. Nahuel puede asignarlas entonces sin recrearlas.

| Orden | Issue | Entrega | Dependencia principal |
| --- | --- | --- | --- |
| 1 | [#12](https://github.com/nanonoir/galcoa/issues/12) | Proveedor Gemini con dobles | Contratos y decisiones ya integrados; falta tu acceso |
| 2 | [#11](https://github.com/nanonoir/galcoa/issues/11) | Carga privada y extracción | Nahuel integra 024 y 041; 043 además consume tu 050 |
| 3 | [#13](https://github.com/nanonoir/galcoa/issues/13) | Redacción con procedencia | Tu 050 y mensajes 041 integrados |
| 4 | [#15](https://github.com/nanonoir/galcoa/issues/15) | Contraste Groq | Extracción 043 y redacción 051 integradas |
| 5 | [#14](https://github.com/nanonoir/galcoa/issues/14) | Streaming, cancelación y reintento | Redacción 051 y auditoría 044 integradas |
| 6 | [#34](https://github.com/nanonoir/galcoa/issues/34) | Dataset y runner, sin evaluación pagada | 122 puede prepararse con F1; 123 consume 053 |

Si 042 espera al backend pero 051 ya tiene sus entradas, podés adelantar 051. Dejá el ticket bloqueado/pausado con un comentario, sin dos sesiones activas ni mezclar ramas. Dataset 122 es otra alternativa mientras esperás: su Issue queda abierta hasta completar también 123. No inventes accesos ni implementes migraciones o configuración compartida para destrabarte.

Tus suites de servidor pueden usar la configuración Node local autorizada por el ticket hasta que Nahuel publique el harness. El `npm test` actual no descubre automáticamente `tests/server/**`; no dar esas pruebas por ejecutadas. No necesitás Docker para los dobles ni un MCP concreto.

## Nahuel — `@nanonoir`

### Primero, liberar a los compañeros

1. [#5](https://github.com/nanonoir/galcoa/issues/5) — esquema/migraciones/RLS. Integrar checkpoints 022, 023 y 024 con evidencia propia; no esperar el cierre de todo el ticket para consumir 023.
2. [#32](https://github.com/nanonoir/galcoa/issues/32) — empezar configuración/dobles temprano, completar base local y puente conforme estén sus productores. No esperar la matriz E2E para construirlo.
3. [#6](https://github.com/nanonoir/galcoa/issues/6) → [#8](https://github.com/nanonoir/galcoa/issues/8) → [#10](https://github.com/nanonoir/galcoa/issues/10) — clientes, sesión y persistencia. Integrar 041/044 libera extracción/redacción y streaming de Gastón.
4. [#9](https://github.com/nanonoir/galcoa/issues/9) — conectar Auth cuando Facu integre 115 y esté 030; no hacerle implementar Auth a Facu.

### Después, seguir los checkpoints, no cerrar planes enteros por fuerza

| Bloque | Issues | Orden útil |
| --- | --- | --- |
| Reglas | [#17](https://github.com/nanonoir/galcoa/issues/17) | Liberar 060 temprano; 061 espera 043 y 062 espera 053 |
| Chat y páginas | [#16](https://github.com/nanonoir/galcoa/issues/16) · [#31](https://github.com/nanonoir/galcoa/issues/31) | Chat tras 052/053; dashboard puede montarse antes. Liberar 116 sin esperar la revisión completa 118 |
| Revisión y confirmaciones | [#18](https://github.com/nanonoir/galcoa/issues/18) → [#19](https://github.com/nanonoir/galcoa/issues/19) → [#20](https://github.com/nanonoir/galcoa/issues/20) → [#21](https://github.com/nanonoir/galcoa/issues/21) | Contratos/advertencias/snapshot primero; UI del autor espera la presentación 112 |
| PDF y versiones | [#22](https://github.com/nanonoir/galcoa/issues/22) → [#23](https://github.com/nanonoir/galcoa/issues/23) | PDF después de todas las confirmaciones; 083 habilita consumidores sin esperar 084 |
| Hedera | [#24](https://github.com/nanonoir/galcoa/issues/24) | 090/093 con dobles pueden adelantarse; 091/092 esperan 083. Sin llamadas reales todavía |
| Verificador | [#25](https://github.com/nanonoir/galcoa/issues/25) | Consume 083 y 093, no necesita esperar cierre completo de HCS |
| Evidencia y seguridad | [#33](https://github.com/nanonoir/galcoa/issues/33) · [#35](https://github.com/nanonoir/galcoa/issues/35) | 121 consume 116, no 118; 131 puede ampliarse con 120 sin esperar 130 |
| Cloud y demo | [#7](https://github.com/nanonoir/galcoa/issues/7) · [#36](https://github.com/nanonoir/galcoa/issues/36) | Acciones reales solo con autorización específica; propietarios cargan secretos |
| Ensayo final | [#37](https://github.com/nanonoir/galcoa/issues/37) | Una sesión real final, dataset de 30 y subconjunto demo de 12; documentar cualquier brecha |
| Gestiones externas | [#3](https://github.com/nanonoir/galcoa/issues/3) · [#4](https://github.com/nanonoir/galcoa/issues/4) | Acceso por persona; jurídica no bloquea demo ficticia |

El paquete frontend y F1 ya están preparados; no repetirlos. Consolidás los contadores y el archivo de planes compartidos. No cerrar el plan de las cinco pantallas al integrar la primera.

## Reglas para los tres

- Máximo tres carriles, solo con archivos disjuntos: núcleo (Nahuel), módulo (Gastón), presentación (Facu). Tomás no tiene carril técnico.
- Dependencia cumplida = ID integrado en `origin/develop`, no una rama ajena ni una Issue cerrada sin evidencia. Los cuerpos enlazan cada ID con su productor; no hace falta que termine todo ese plan.
- Todos pueden entregar por rama/PR/merge autónomo. Sin push directo a `develop`, force-push, checks obligatorios ni aprobación humana universal. Se conserva CI y se informan resultados reales.
- Claude intenta corregir los fallos. Si queda uno no sensible y no impide el recorrido principal, puede mergear con advertencia en PR y aviso al ejecutor. Secretos, permisos, pérdida de datos o finalización sin confirmaciones: no mergear y escalar al líder.
- Para instalar un `.env` aportado: copia opaca con `npm run env:install -- <ruta>`. No leerlo, mostrarlo ni subirlo. Presentación/dobles no lo necesitan; no se usa `.env.local`.
- Evaluación real de proveedores: una única sesión al final, no una por ticket. Tests locales con dobles siguen siendo parte de cada entrega.

Referencias: [AGENTS](../../AGENTS.md) · [matriz de compatibilidad](mvp-execution-guide.md#matriz-de-compatibilidad-y-recursos-compartidos) · [copias e inventario de Issues](../tasks/issue-rollout/README.md).
