"""create seguimientos

Revision ID: 9c71a4f5d2b0
Revises: 2f4e8d1b9c12
Create Date: 2026-05-12
"""

from alembic import op
import sqlalchemy as sa


revision = "9c71a4f5d2b0"
down_revision = "2f4e8d1b9c12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "seguimientos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pensionado_id", sa.Integer(), nullable=False),
        sa.Column("oficina_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=False),
        sa.Column("resultado", sa.String(length=80), nullable=True),
        sa.Column("fecha_proximo_contacto", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(["oficina_id"], ["oficinas.id"]),
        sa.ForeignKeyConstraint(["pensionado_id"], ["pensionados.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_seguimientos_pensionado_id", "seguimientos", ["pensionado_id"])
    op.create_index("ix_seguimientos_oficina_id", "seguimientos", ["oficina_id"])
    op.create_index("ix_seguimientos_usuario_id", "seguimientos", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_seguimientos_usuario_id", table_name="seguimientos")
    op.drop_index("ix_seguimientos_oficina_id", table_name="seguimientos")
    op.drop_index("ix_seguimientos_pensionado_id", table_name="seguimientos")
    op.drop_table("seguimientos")
