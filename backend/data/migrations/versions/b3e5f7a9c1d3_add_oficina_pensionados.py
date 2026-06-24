"""add oficina pensionados

Revision ID: b3e5f7a9c1d3
Revises: a2d4f6b8c0e2
"""
from alembic import op
import sqlalchemy as sa
revision="b3e5f7a9c1d3"; down_revision="a2d4f6b8c0e2"; branch_labels=None; depends_on=None
def upgrade():
    op.add_column("pensionados", sa.Column("oficina_id", sa.Integer(), nullable=True))
    op.execute("""UPDATE pensionados p SET oficina_id = COALESCE((SELECT c.oficina_id FROM creditos c WHERE c.pensionado_id=p.id ORDER BY c.id LIMIT 1),(SELECT s.oficina_id FROM seguimientos s WHERE s.pensionado_id=p.id ORDER BY s.id LIMIT 1),(SELECT id FROM oficinas ORDER BY id LIMIT 1))""")
    op.alter_column("pensionados", "oficina_id", nullable=False)
    op.create_foreign_key("fk_pensionados_oficina", "pensionados", "oficinas", ["oficina_id"], ["id"])
    op.create_index("ix_pensionados_oficina_id", "pensionados", ["oficina_id"])
def downgrade():
    op.drop_index("ix_pensionados_oficina_id", table_name="pensionados"); op.drop_constraint("fk_pensionados_oficina", "pensionados", type_="foreignkey"); op.drop_column("pensionados", "oficina_id")
