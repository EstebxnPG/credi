"""add credito situacion

Revision ID: 3e4f5a6b7c8d
Revises: 1d9a7c4e2b80
Create Date: 2026-07-30
"""
from alembic import op


revision = "3e4f5a6b7c8d"
down_revision = "1d9a7c4e2b80"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE creditos ADD COLUMN IF NOT EXISTS situacion_credito varchar(30)")
    op.execute("ALTER TABLE creditos ADD COLUMN IF NOT EXISTS fecha_reactivacion date")
    op.execute("ALTER TABLE creditos ADD COLUMN IF NOT EXISTS observacion_situacion text")
    op.execute(
        """
        UPDATE creditos
        SET situacion_credito = CASE
            WHEN estado = 'Finalizado' THEN 'CIERRE_VALIDADO'
            ELSE 'NORMAL'
        END
        WHERE situacion_credito IS NULL
        """
    )
    op.execute("ALTER TABLE creditos ALTER COLUMN situacion_credito SET DEFAULT 'NORMAL'")
    op.execute("ALTER TABLE creditos ALTER COLUMN situacion_credito SET NOT NULL")
    op.execute("ALTER TABLE creditos DROP CONSTRAINT IF EXISTS ck_creditos_situacion_credito")
    op.execute(
        """
        ALTER TABLE creditos
        ADD CONSTRAINT ck_creditos_situacion_credito
        CHECK (situacion_credito IN (
            'NORMAL',
            'PENDIENTE_CIERRE',
            'ACTIVO_INCONSISTENTE',
            'CIERRE_VALIDADO'
        ))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE creditos DROP CONSTRAINT IF EXISTS ck_creditos_situacion_credito")
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS observacion_situacion")
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS fecha_reactivacion")
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS situacion_credito")
