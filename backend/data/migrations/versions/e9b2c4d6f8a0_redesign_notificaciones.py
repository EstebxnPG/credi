"""redesign notificaciones

Revision ID: e9b2c4d6f8a0
Revises: d8a1e3f5b7c9
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e9b2c4d6f8a0"
down_revision: Union[str, None] = "d8a1e3f5b7c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_notificaciones_usuario_clave", "notificaciones", type_="unique")
    op.drop_constraint("notificaciones_usuario_id_fkey", "notificaciones", type_="foreignkey")
    op.drop_index("ix_notificaciones_usuario_id", table_name="notificaciones")
    op.alter_column("notificaciones", "usuario_id", new_column_name="responsable_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("notificaciones", sa.Column("oficina_id", sa.Integer(), nullable=True))
    op.add_column("notificaciones", sa.Column("clase", sa.String(20), nullable=False, server_default="accion"))
    op.add_column("notificaciones", sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"))
    op.add_column("notificaciones", sa.Column("entidad_tipo", sa.String(40)))
    op.add_column("notificaciones", sa.Column("entidad_id", sa.Integer()))
    op.add_column("notificaciones", sa.Column("pensionado_id", sa.Integer()))
    op.add_column("notificaciones", sa.Column("leida_en", sa.DateTime(timezone=True)))
    op.add_column("notificaciones", sa.Column("pospuesta_hasta", sa.DateTime(timezone=True)))
    op.add_column("notificaciones", sa.Column("resuelta_en", sa.DateTime(timezone=True)))
    op.add_column("notificaciones", sa.Column("resuelta_por", sa.Integer()))
    op.add_column("notificaciones", sa.Column("justificacion", sa.Text()))
    op.add_column("notificaciones", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.execute("UPDATE notificaciones n SET oficina_id = u.oficina_id FROM usuarios u WHERE u.id = n.responsable_id")
    op.alter_column("notificaciones", "oficina_id", nullable=False)
    op.create_foreign_key("fk_notificacion_oficina", "notificaciones", "oficinas", ["oficina_id"], ["id"])
    op.create_foreign_key("fk_notificacion_responsable", "notificaciones", "usuarios", ["responsable_id"], ["id"])
    op.create_foreign_key("fk_notificacion_resuelta_por", "notificaciones", "usuarios", ["resuelta_por"], ["id"])
    op.create_foreign_key("fk_notificacion_pensionado", "notificaciones", "pensionados", ["pensionado_id"], ["id"])
    # Los registros anteriores eran snapshots regenerados por lectura y no tienen
    # un ciclo de vida confiable. Se reconstruyen desde las fuentes de dominio.
    op.execute("DELETE FROM notificaciones")
    op.create_unique_constraint("uq_notificaciones_clave", "notificaciones", ["clave"])
    for col in ("oficina_id", "responsable_id", "tipo", "estado", "entidad_tipo", "entidad_id", "pensionado_id"):
        op.create_index(f"ix_notificaciones_{col}", "notificaciones", [col])


def downgrade() -> None:
    raise RuntimeError("La migracion de notificaciones no admite downgrade seguro")
