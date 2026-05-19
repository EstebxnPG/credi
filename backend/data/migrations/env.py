import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("POSTGRES_USER", os.environ["POSTGRES_USER"])
config.set_main_option("POSTGRES_PASSWORD", os.environ["POSTGRES_PASSWORD"])
config.set_main_option("POSTGRES_HOST", os.environ["POSTGRES_HOST"])
config.set_main_option("POSTGRES_PORT", os.environ["POSTGRES_PORT"])
config.set_main_option("POSTGRES_DB", os.environ["POSTGRES_DB"])

from app.db.base import Base
from app.db.models import (
    Oficina, Cooperativa, Pagaduria, Usuario,
    Pensionado, Credito, Documento,
    HistorialCredito, Refinanciacion, Log, Seguimiento
)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
