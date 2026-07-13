"""normalize credito tipo_credito

Revision ID: f8b6c2d4a901
Revises: 0b6f1e2d3c4a, 0f7e2d9c4b81
Create Date: 2026-07-13
"""
from alembic import op


revision = "f8b6c2d4a901"
down_revision = ("0b6f1e2d3c4a", "0f7e2d9c4b81")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE creditos DROP CONSTRAINT IF EXISTS ck_creditos_tipo_credito")
    op.execute(
        """
        UPDATE creditos
        SET tipo_credito = CASE
            WHEN tipo_credito IS NULL OR btrim(tipo_credito) = '' THEN 'NUEVO'
            WHEN upper(btrim(tipo_credito)) IN ('NUEVO', 'NUEVA') THEN 'NUEVO'
            WHEN upper(btrim(tipo_credito)) IN ('PLAN PRIMA', 'CAMBIO') THEN 'NUEVO'
            WHEN upper(btrim(tipo_credito)) IN ('REF', 'REFINANCIACION', 'REFINANCIACIÓN') THEN 'REFINANCIACION'
            WHEN upper(btrim(tipo_credito)) LIKE 'REF%' THEN 'REFINANCIACION'
            WHEN upper(btrim(tipo_credito)) IN ('COMPRA', 'COMPRA CARTERA', 'COMPRA DE CARTERA') THEN 'COMPRA CARTERA'
            WHEN upper(btrim(tipo_credito)) LIKE '%COMPRA%' OR upper(btrim(tipo_credito)) LIKE '%CARTERA%' THEN 'COMPRA CARTERA'
            ELSE 'NUEVO'
        END
        """
    )
    op.execute(
        """
        ALTER TABLE creditos
        ADD CONSTRAINT ck_creditos_tipo_credito
        CHECK (tipo_credito IN ('NUEVO', 'REFINANCIACION', 'COMPRA CARTERA'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE creditos DROP CONSTRAINT IF EXISTS ck_creditos_tipo_credito")
