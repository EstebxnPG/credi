"""remove unused cooperativa fields

Revision ID: 7a5d2c9e1b44
Revises: 6e2c1f9a8b34
Create Date: 2026-06-02
"""

from alembic import op


revision = "7a5d2c9e1b44"
down_revision = "6e2c1f9a8b34"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cooperativas DROP COLUMN IF EXISTS porcentaje_comision")
    op.execute("ALTER TABLE cooperativas DROP COLUMN IF EXISTS tiempo_minimo_pension")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE cooperativas "
        "ADD COLUMN IF NOT EXISTS tiempo_minimo_pension integer NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE cooperativas "
        "ADD COLUMN IF NOT EXISTS porcentaje_comision numeric(5, 2) NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE cooperativas ALTER COLUMN tiempo_minimo_pension DROP DEFAULT")
    op.execute("ALTER TABLE cooperativas ALTER COLUMN porcentaje_comision DROP DEFAULT")
