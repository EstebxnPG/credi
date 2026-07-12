"""add percentage refinancing rules

Revision ID: 0b6f1e2d3c4a
Revises: f4a9c1d2e3b5
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa


revision = "0b6f1e2d3c4a"
down_revision = "f4a9c1d2e3b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cooperativa_refinanciacion_reglas",
        sa.Column("tipo_liberacion", sa.String(length=20), nullable=False, server_default="meses"),
    )
    op.add_column(
        "cooperativa_refinanciacion_reglas",
        sa.Column("porcentaje_credito", sa.Numeric(5, 2), nullable=True),
    )
    op.alter_column(
        "cooperativa_refinanciacion_reglas",
        "meses_para_refinanciar",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "cooperativa_refinanciacion_reglas",
        "tipo_liberacion",
        server_default=None,
    )


def downgrade() -> None:
    op.execute(
        "UPDATE cooperativa_refinanciacion_reglas "
        "SET meses_para_refinanciar = 1 "
        "WHERE meses_para_refinanciar IS NULL"
    )
    op.alter_column(
        "cooperativa_refinanciacion_reglas",
        "meses_para_refinanciar",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column("cooperativa_refinanciacion_reglas", "porcentaje_credito")
    op.drop_column("cooperativa_refinanciacion_reglas", "tipo_liberacion")
