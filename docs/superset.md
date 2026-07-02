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

- `creditos`: embudo por estado, valor solicitado, valor aprobado y fechas.
- `pensionados`: segmentacion comercial por oficina, pagaduria y asesor.
- `seguimientos`: productividad, estado de gestion y tiempos de respuesta.
- `refinanciaciones`: oportunidades, entidad origen y resultado.
- `usuarios` y `oficinas`: dimensiones administrativas para filtros.

## Criterio profesional

Esto es BI operacional, no todavia una plataforma analitica completa. El siguiente nivel seria:

1. Crear vistas SQL estables para analitica en vez de graficar directamente tablas transaccionales.
2. Separar una base/warehouse analitico con modelos limpios.
3. Orquestar cargas con dbt/Airflow o similar.
4. Agregar pruebas de calidad de datos.
5. Versionar dashboards y modelos semanticos.
