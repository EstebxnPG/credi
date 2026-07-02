"""create notificacion lecturas

Revision ID: f4a9c1d2e3b5
Revises: c4f6a8b0d2e4
Create Date: 2026-06-28 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f4a9c1d2e3b5"
down_revision: Union[str, None] = "c4f6a8b0d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notificacion_lecturas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notificacion_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("leida_en", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["notificacion_id"], ["notificaciones.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("notificacion_id", "usuario_id", name="uq_notificacion_lectura_usuario"),
    )
    op.create_index(op.f("ix_notificacion_lecturas_notificacion_id"), "notificacion_lecturas", ["notificacion_id"])
    op.create_index(op.f("ix_notificacion_lecturas_usuario_id"), "notificacion_lecturas", ["usuario_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_notificacion_lecturas_usuario_id"), table_name="notificacion_lecturas")
    op.drop_index(op.f("ix_notificacion_lecturas_notificacion_id"), table_name="notificacion_lecturas")
    op.drop_table("notificacion_lecturas")
