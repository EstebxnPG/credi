"""add estado and soluciones seguimientos

Revision ID: aa31d6e4f8c2
Revises: 1a2b3c4d5e6f
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa31d6e4f8c2"
down_revision: Union[str, None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "seguimientos",
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="abierto"),
    )
    op.execute(
        """
        UPDATE seguimientos
        SET estado = CASE
            WHEN fecha_proximo_contacto IS NOT NULL THEN 'pendiente'
            ELSE 'abierto'
        END
        """
    )
    op.create_index("ix_seguimientos_estado", "seguimientos", ["estado"])

    op.create_table(
        "seguimiento_soluciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("seguimiento_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=False),
        sa.Column("resultado", sa.String(length=80), nullable=True),
        sa.Column("estado_resultante", sa.String(length=20), nullable=True),
        sa.Column("fecha_proximo_contacto", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["seguimiento_id"], ["seguimientos.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_seguimiento_soluciones_seguimiento_id", "seguimiento_soluciones", ["seguimiento_id"])
    op.create_index("ix_seguimiento_soluciones_usuario_id", "seguimiento_soluciones", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_seguimiento_soluciones_usuario_id", table_name="seguimiento_soluciones")
    op.drop_index("ix_seguimiento_soluciones_seguimiento_id", table_name="seguimiento_soluciones")
    op.drop_table("seguimiento_soluciones")
    op.drop_index("ix_seguimientos_estado", table_name="seguimientos")
    op.drop_column("seguimientos", "estado")
