import os


SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]

SQLALCHEMY_DATABASE_URI = (
    "postgresql+psycopg2://"
    f"{os.environ['SUPERSET_DB_USER']}:"
    f"{os.environ['SUPERSET_DB_PASSWORD']}@"
    f"{os.environ.get('SUPERSET_DB_HOST', 'superset_db')}:"
    f"{os.environ.get('SUPERSET_DB_PORT', '5432')}/"
    f"{os.environ['SUPERSET_DB_NAME']}"
)

WTF_CSRF_ENABLED = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

FEATURE_FLAGS = {
    "DASHBOARD_NATIVE_FILTERS": True,
    "ENABLE_TEMPLATE_PROCESSING": True,
}

TALISMAN_ENABLED = False
