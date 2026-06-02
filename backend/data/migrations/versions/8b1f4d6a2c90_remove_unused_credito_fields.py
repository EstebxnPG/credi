"""remove unused credito fields

Revision ID: 8b1f4d6a2c90
Revises: 7a5d2c9e1b44
Create Date: 2026-06-02
"""

from alembic import op


revision = "8b1f4d6a2c90"
down_revision = "7a5d2c9e1b44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS tasa_mensual")
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS nro_afiliacion")


def downgrade() -> None:
    op.execute("ALTER TABLE creditos ADD COLUMN IF NOT EXISTS tasa_mensual numeric(5, 4)")
    op.execute("ALTER TABLE creditos ADD COLUMN IF NOT EXISTS nro_afiliacion varchar(50)")
