"""create pendientes credito

Revision ID: 6e2c1f9a8b34
Revises: 4d1a8c2b7e90
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6e2c1f9a8b34"
down_revision: Union[str, None] = "4d1a8c2b7e90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pendientes_credito",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("credito_id", sa.Integer(), nullable=False),
        sa.Column("documento_id", sa.Integer(), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("origen", sa.String(length=30), nullable=False),
        sa.Column("observacion_resolucion", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("resolved_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["credito_id"], ["creditos.id"]),
        sa.ForeignKeyConstraint(["documento_id"], ["documentos.id"]),
        sa.ForeignKeyConstraint(["resolved_by"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pendientes_credito_credito_id", "pendientes_credito", ["credito_id"])
    op.create_index("ix_pendientes_credito_estado", "pendientes_credito", ["estado"])


def downgrade() -> None:
    op.drop_index("ix_pendientes_credito_estado", table_name="pendientes_credito")
    op.drop_index("ix_pendientes_credito_credito_id", table_name="pendientes_credito")
    op.drop_table("pendientes_credito")
