"""add pensionado oficinas and office color

Revision ID: 1a2b3c4d5e6f
Revises: f4a9c1d2e3b5
"""
from alembic import op
import sqlalchemy as sa

revision = "1a2b3c4d5e6f"
down_revision = "f4a9c1d2e3b5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("oficinas", sa.Column("color", sa.String(length=20), nullable=True))
    op.execute(
        """
        UPDATE oficinas
        SET color = CASE
            WHEN id = (SELECT min(id) FROM oficinas) THEN 'blue'
            ELSE 'red'
        END
        """
    )
    op.alter_column("oficinas", "color", nullable=False)

    op.create_table(
        "pensionado_oficinas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pensionado_id", sa.Integer(), sa.ForeignKey("pensionados.id"), nullable=False),
        sa.Column("oficina_id", sa.Integer(), sa.ForeignKey("oficinas.id"), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("vinculada_en", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("pensionado_id", "oficina_id", name="uq_pensionado_oficina"),
    )
    op.create_index("ix_pensionado_oficinas_pensionado_id", "pensionado_oficinas", ["pensionado_id"])
    op.create_index("ix_pensionado_oficinas_oficina_id", "pensionado_oficinas", ["oficina_id"])
    op.create_index("ix_pensionado_oficinas_created_by", "pensionado_oficinas", ["created_by"])
    op.execute(
        """
        INSERT INTO pensionado_oficinas (pensionado_id, oficina_id, created_by)
        SELECT id, oficina_id, created_by
        FROM pensionados
        ON CONFLICT DO NOTHING
        """
    )


def downgrade():
    op.drop_index("ix_pensionado_oficinas_created_by", table_name="pensionado_oficinas")
    op.drop_index("ix_pensionado_oficinas_oficina_id", table_name="pensionado_oficinas")
    op.drop_index("ix_pensionado_oficinas_pensionado_id", table_name="pensionado_oficinas")
    op.drop_table("pensionado_oficinas")
    op.drop_column("oficinas", "color")
