# Casos de prueba UI/E2E

Este documento define los casos que deben cubrirse antes de demo seria o salida a producción. La prioridad no es hacer clic por hacer clic: es proteger reglas de negocio, datos sensibles y alertas operativas.

## Cuentas y alcance

- Administrador: puede ver todas las oficinas, usuarios, auditoría, reportes y reasignar/cerrar notificaciones.
- Asesora: solo ve datos de su oficina, solo crea créditos propios y no puede reabrir notificaciones descartadas.
- Usuario sin sesión: cualquier ruta interna debe redirigir a `/login?next=...`.

## Login y sesión

| ID | Caso | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| AUTH-01 | Login válido | Entrar con correo y contraseña correctos | Redirige a `/dashboard`, muestra nombre, rol y menú según permisos |
| AUTH-02 | Contraseña inválida | Enviar credenciales incorrectas | Muestra error legible, no `[object Object]`, no entra al dashboard |
| AUTH-03 | Email inválido | Enviar correo con formato inválido | Muestra validación legible |
| AUTH-04 | Sesión expirada | Guardar token expirado y abrir `/creditos` | Limpia sesión y redirige a login |
| AUTH-05 | Cerrar sesión | Click en `Salir` | Borra sesión y vuelve a login |

## Pensionados

| ID | Caso | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| PEN-01 | Crear pensionado mínimo | Nombre, documento válido, oficina implícita | Se crea, aparece en listado y detalle |
| PEN-02 | Documento inválido | Documento con letras o menos de 6 dígitos | UI muestra error de validación |
| PEN-03 | Documento duplicado | Crear pensionado ya existente | Muestra conflicto sin duplicar registro |
| PEN-04 | Fecha futura | Crear/editar con fecha de nacimiento futura | Bloquea guardado |
| PEN-05 | Correo inválido | Ingresar correo sin formato válido | Muestra error |
| PEN-06 | Búsqueda | Buscar por nombre/documento | Lista solo coincidencias y mantiene estado vacío correcto |
| PEN-07 | Vinculación a oficina | Admin vincula pensionado a otra oficina | Pensionado queda visible para esa oficina |
| PEN-08 | Crear pensionado y crédito | Activar “Crear crédito para este pensionado” y completar solicitud | Crea pensionado y crédito en un solo flujo |
| PEN-09 | Formulario largo en móvil | Abrir modal en 390px | No hay solapes; botones cancelar/guardar siguen visibles |

## Créditos

| ID | Caso | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| CRE-01 | Crear crédito nuevo válido | Pensionado, cooperativa, pagaduría, asesor, monto y plazo válidos | Crédito queda en `Prospecto` |
| CRE-02 | Monto cero/negativo | Enviar monto `0` o negativo | UI muestra validación |
| CRE-03 | Plazo cero/negativo | Enviar plazo `0` o negativo | UI muestra validación |
| CRE-04 | Reglas cooperativa | Monto/plazo/edad fuera de regla | Bloquea con mensaje del backend |
| CRE-05 | Asesora fuera de oficina | Asesora intenta crear para otra oficina o asesor | Backend responde 403 y UI lo muestra |
| CRE-06 | Pensionado fuera de oficina | Crear crédito en oficina no vinculada | Bloquea creación |
| CRE-07 | Crédito nuevo con crédito anterior | Tipo `NUEVO` con crédito refinanciado | Bloquea |
| CRE-08 | Compra cartera sin entidad | Tipo `COMPRA CARTERA` sin entidad financiera origen | Bloquea |
| CRE-09 | Compra cartera con crédito interno | Tipo `COMPRA CARTERA` y crédito refinanciado | Bloquea |
| CRE-10 | Refinanciación sin crédito anterior | Tipo `REFINANCIACION` sin crédito aprobado | Bloquea |
| CRE-11 | Refinanciación duplicada | Crear segunda refinanciación sobre el mismo crédito | Bloquea con conflicto |
| CRE-12 | Editar Prospecto | Modificar monto/plazo/pagaduria en Prospecto | Guarda cambios y registra auditoría |
| CRE-13 | Editar Aprobado/Rechazado/Finalizado | Intentar editar estado final | Bloquea |
| CRE-14 | Enviar a cooperativa | Cambiar `Prospecto` -> `Enviado a cooperativa` | Cambia estado e historial |
| CRE-15 | Aprobar sin monto/fechas | Cambiar a `Aprobado` sin campos obligatorios | Bloquea |
| CRE-16 | Aprobar con fecha fin incorrecta | Fecha fin no coincide con plazo | Bloquea |
| CRE-17 | Aprobar con pendientes | Crédito con documentos o tareas pendientes | Bloquea aprobación |
| CRE-18 | Aprobar válido | Monto, cuota, desembolso y fecha fin correctos | Estado `Aprobado`, crea oportunidad de refinanciación si aplica |
| CRE-19 | Finalizar no aprobado | Intentar finalizar desde estado distinto a `Aprobado` | Bloquea |
| CRE-20 | Finalizar aprobado sin motivo | Cambiar a `Finalizado` sin motivo | Bloquea |
| CRE-21 | Finalizar aprobado válido | Motivo válido | Estado `Finalizado` y motivo normalizado |
| CRE-22 | Documentos pendientes activados | Marcar docs pendientes con descripción | Crea notificación `documento_pendiente` alta |
| CRE-23 | Documentos pendientes sin descripción | Activar flag y dejar descripción vacía | Bloquea |
| CRE-24 | Resolver documentos pendientes | Desactivar flag | Resuelve notificación de documentos |
| CRE-25 | Orden y búsqueda | Buscar por crédito, pensionado, documento, libranza, cooperativa | Resultados y contador coherentes |
| CRE-26 | Responsive tabla | Abrir `/creditos` en móvil | No hay solapes, acciones siguen usables |

## Notificaciones

| ID | Caso | Disparador | Resultado esperado |
| --- | --- | --- | --- |
| NOT-01 | Cumpleaños hoy | Pensionado activo con fecha de nacimiento hoy | Notificación informativa `cumpleanos_hoy`, prioridad media |
| NOT-02 | Seguimiento mañana | Seguimiento abierto con próximo contacto mañana | Notificación `seguimiento_antes`, prioridad media |
| NOT-03 | Seguimiento hoy | Seguimiento abierto con fecha de hoy | Notificación `seguimiento_hoy`, prioridad alta |
| NOT-04 | Seguimiento vencido | Seguimiento abierto con fecha anterior | Notificación `seguimiento_vencido`, prioridad alta |
| NOT-05 | Seguimiento resuelto | Cerrar seguimiento | Notificación abierta se resuelve |
| NOT-06 | Documento pendiente | Crédito con `tiene_documentos_pendientes=true` | Notificación de acción, prioridad alta |
| NOT-07 | Documento pendiente resuelto | Quitar documentos pendientes | Notificación pasa a resuelta |
| NOT-08 | Pendiente operativo | Pendiente de crédito en estado pendiente | Notificación `pendiente_operativo`, prioridad alta |
| NOT-09 | Pendiente operativo resuelto | Cambiar pendiente a resuelto | Notificación se resuelve |
| NOT-10 | Refinanciación disponible | Crédito aprobado cumple regla y fecha disponible <= hoy | Notificación `refinanciacion_disponible`, prioridad alta |
| NOT-11 | Refinanciación futura | Disponible desde fecha futura | No aparece aún como notificación visible |
| NOT-12 | Refinanciación convertida/rechazada/pospuesta | Cambiar oportunidad comercial | Notificación abierta se resuelve |
| NOT-13 | Deduplicación | Ejecutar sincronización varias veces | No duplica notificaciones por clave |
| NOT-14 | Reapertura controlada | Regla vuelve a aplicar sobre cerrada/descartada | Solo reabre cuando la regla lo permite |
| NOT-15 | Marcar una como leída | Click en notificación | Crea lectura por usuario y baja contador |
| NOT-16 | Marcar todas leídas | Click en “Marcar leídas” | Todas las visibles quedan leídas para ese usuario |
| NOT-17 | En progreso | Cambiar acción pendiente a en progreso | Asigna responsable si estaba vacío |
| NOT-18 | Posponer | Posponer con fecha futura | Oculta hasta fecha; al vencer vuelve a pendiente |
| NOT-19 | Posponer fecha pasada | Intentar fecha vencida | Bloquea |
| NOT-20 | Descartar sin justificación | Intentar descartar vacío | Bloquea |
| NOT-21 | Reabrir descartada como asesora | Asesora intenta reabrir | Bloquea 403 |
| NOT-22 | Filtro por oficina admin | Admin filtra por oficina | Lista solo esa oficina |
| NOT-23 | Alcance asesora | Asesora abre notificaciones | Solo ve su oficina |

## Bugs visuales a vigilar

- Nunca mostrar `[object Object]` en errores.
- No dejar botones fuera de pantalla en modales móviles.
- No truncar valores críticos como documento, crédito, estado o monto sin tooltip/contexto suficiente.
- El contador de notificaciones debe coincidir con elementos no leídos visibles para el usuario.
- Los estados vacíos deben decir qué pasó, no quedarse en blanco.
- Textos visibles deben tener tildes y español consistente.

## Automatización recomendada

- Unit tests backend: reglas puras y transiciones.
- Integration tests API: creación real de pensionado/crédito/notificación en DB temporal.
- E2E Playwright: login, flujos principales, modales, notificaciones y responsive.
- Visual regression: screenshots de login, dashboard, créditos, pensionados, notificaciones en desktop y móvil.
