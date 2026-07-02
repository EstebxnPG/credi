ARG SUPERSET_IMAGE=apache/superset:4.1.1
FROM ${SUPERSET_IMAGE}

USER root
RUN pip install --no-cache-dir psycopg2-binary==2.9.9
USER superset
