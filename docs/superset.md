# Fase analitica con Apache Superset

Superset queda montado como capa de BI local sobre el stack Docker del proyecto.

## Servicios

- `superset_db`: base PostgreSQL separada para metadatos internos de Superset.
- `superset_init`: job de inicializacion; corre migraciones, crea el admin y prepara roles.
- `superset`: interfaz web de Superset en `http://localhost:8088`.

## Arranque

```bash
docker compose up -d --build superset_db superset_init superset
```

Credenciales locales:

Define `SUPERSET_ADMIN_USERNAME`, `SUPERSET_ADMIN_PASSWORD` y `SUPERSET_SECRET_KEY` en `.env`.
No uses passwords de ejemplo ni reutilices credenciales de otros servicios.

## Conexion a la base transaccional

No conectes Superset a `credi_db` con el usuario dueno de la aplicacion. Crea un usuario de solo lectura y define su password en una variable local:

```bash
export SUPERSET_READER_PASSWORD="<password_largo_generado>"
docker exec credi_db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE USER superset_reader WITH PASSWORD '\'''"$SUPERSET_READER_PASSWORD"''\'';"'
docker exec credi_db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT CONNECT ON DATABASE \"$POSTGRES_DB\" TO superset_reader;"'
docker exec credi_db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT USAGE ON SCHEMA public TO superset_reader;"'
docker exec credi_db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO superset_reader;"'
docker exec credi_db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO superset_reader;"'
```

En Superset, agrega una base de datos PostgreSQL con esta URI:

```text
postgresql+psycopg2://superset_reader:<SUPERSET_READER_PASSWORD>@db:5432/<POSTGRES_DB>
```

Usa `db` como host porque Superset corre dentro de la misma red de Docker Compose.

## Primeros datasets recomendados

No grafiques directamente las tablas transaccionales si el objetivo es control gerencial. Usa las vistas del schema `analytics`, definidas en [`docs/superset_analytics_views.sql`](./superset_analytics_views.sql):

```bash
Get-Content docs\superset_analytics_views.sql | docker exec -i credi_db psql -U credi_user -d crediconfiemos
```

Datasets iniciales para Superset:

- `analytics.ds_creditos_detalle`: dataset principal, un credito activo por fila. Sirve para embudo, cartera viva, cierres, monto de referencia, cooperativa, pagaduria, asesor y oficina.
- `analytics.ds_originacion_mensual`: dataset agregado por mes y dimensiones comerciales. Sirve para tendencia, mix de producto, ranking y comparativos.
- `analytics.ds_pensionados_360`: un pensionado activo por fila. Sirve para segmentacion comercial, clientes con credito vivo, clientes historicos y oportunidades activas.
- `analytics.ds_oportunidades_refinanciacion`: pipeline de refinanciacion. Sirve para oportunidades disponibles, gestionadas, pospuestas, ganadas y alertas por falta de gestion.
- `analytics.ds_calidad_datos`: tablero de gobierno de datos. Sirve para controlar campos faltantes, cierres pendientes y oportunidades sin actualizacion.

Metricas base sugeridas:

- Creditos activos: `count(credito_id)` filtrando `es_credito_vivo = true`.
- Creditos cerrados: `count(credito_id)` filtrando `es_credito_cerrado = true`.
- Monto de referencia: `sum(monto_referencia)`.
- Ticket promedio: `avg(monto_referencia)`.
- Oportunidades activas: `count(oportunidad_id)` filtrando `etapa_bi = 'pipeline_activo'`.
- Oportunidades ganadas: `count(oportunidad_id)` filtrando `es_ganada = true`.
- Monto de impacto de oportunidades: `sum(monto_impacto_referencia)`.
- Casos de calidad de datos: `count(*)` por `regla_calidad`.

Nota de negocio: como la empresa no registra comisiones reales por cooperativa, estos datasets no prometen utilidad o ingreso contable. El valor financiero se modela como `monto_referencia`, usando `monto_aprobado` cuando existe y `monto_solicitado` como respaldo.

## Criterio profesional

Esto es BI operacional, no todavia una plataforma analitica completa. El siguiente nivel seria:

1. Crear vistas SQL estables para analitica en vez de graficar directamente tablas transaccionales.
2. Separar una base/warehouse analitico con modelos limpios.
3. Orquestar cargas con dbt/Airflow o similar.
4. Agregar pruebas de calidad de datos.
5. Versionar dashboards y modelos semanticos.
