"""create cooperativa refinanciacion reglas

Revision ID: a1d4c7e9b230
Revises: 9c2e7a1d4f80
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa


revision = "a1d4c7e9b230"
down_revision = "9c2e7a1d4f80"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cooperativa_refinanciacion_reglas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cooperativa_id", sa.Integer(), nullable=False),
        sa.Column("plazo_minimo", sa.Integer(), nullable=False),
        sa.Column("plazo_maximo", sa.Integer(), nullable=False),
        sa.Column("meses_para_refinanciar", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["cooperativa_id"], ["cooperativas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("cooperativa_refinanciacion_reglas")
