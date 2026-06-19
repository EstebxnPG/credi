"""oportunidades refinanciacion

Revision ID: f0c3d5e7a9b1
Revises: e9b2c4d6f8a0
"""
from alembic import op
import sqlalchemy as sa

revision = "f0c3d5e7a9b1"
down_revision = "e9b2c4d6f8a0"
branch_labels = None
depends_on = None

def upgrade():
    op.create_unique_constraint("uq_creditos_credito_refinanciado", "creditos", ["credito_refinanciado_id"])
    op.create_table("oportunidades_refinanciacion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("credito_id", sa.Integer(), sa.ForeignKey("creditos.id"), nullable=False),
        sa.Column("oficina_id", sa.Integer(), sa.ForeignKey("oficinas.id"), nullable=False),
        sa.Column("responsable_id", sa.Integer(), sa.ForeignKey("usuarios.id")),
        sa.Column("estado", sa.String(20), nullable=False, server_default="disponible"),
        sa.Column("justificacion", sa.Text()),
        sa.Column("reactivar_en", sa.DateTime(timezone=True)),
        sa.Column("credito_nuevo_id", sa.Integer(), sa.ForeignKey("creditos.id"), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("credito_id", name="uq_oportunidad_refinanciacion_credito"),
    )
    op.create_index("ix_oportunidades_refinanciacion_oficina_id", "oportunidades_refinanciacion", ["oficina_id"])
    op.create_index("ix_oportunidades_refinanciacion_estado", "oportunidades_refinanciacion", ["estado"])
    op.create_table("historial_oportunidades_refinanciacion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("oportunidad_id", sa.Integer(), sa.ForeignKey("oportunidades_refinanciacion.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id")),
        sa.Column("estado_anterior", sa.String(20)),
        sa.Column("estado_nuevo", sa.String(20), nullable=False),
        sa.Column("justificacion", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_historial_oportunidades_refinanciacion_oportunidad_id", "historial_oportunidades_refinanciacion", ["oportunidad_id"])

def downgrade():
    op.drop_table("historial_oportunidades_refinanciacion")
    op.drop_table("oportunidades_refinanciacion")
    op.drop_constraint("uq_creditos_credito_refinanciado", "creditos", type_="unique")
