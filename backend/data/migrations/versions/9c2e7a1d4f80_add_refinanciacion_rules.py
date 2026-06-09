"""add refinanciacion rules

Revision ID: 9c2e7a1d4f80
Revises: 8b1f4d6a2c90
Create Date: 2026-06-02
"""

from alembic import op


revision = "9c2e7a1d4f80"
down_revision = "8b1f4d6a2c90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cooperativas "
        "ADD COLUMN IF NOT EXISTS meses_para_refinanciacion integer NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE creditos "
        "ADD COLUMN IF NOT EXISTS credito_refinanciado_id integer NULL"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_creditos_credito_refinanciado'
            ) THEN
                ALTER TABLE creditos
                ADD CONSTRAINT fk_creditos_credito_refinanciado
                FOREIGN KEY (credito_refinanciado_id) REFERENCES creditos(id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE creditos DROP CONSTRAINT IF EXISTS fk_creditos_credito_refinanciado")
    op.execute("ALTER TABLE creditos DROP COLUMN IF EXISTS credito_refinanciado_id")
    op.execute("ALTER TABLE cooperativas DROP COLUMN IF EXISTS meses_para_refinanciacion")
