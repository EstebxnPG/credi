"""add creator pensionados

Revision ID: c4f6a8b0d2e4
Revises: b3e5f7a9c1d3
"""
from alembic import op
import sqlalchemy as sa
revision="c4f6a8b0d2e4"; down_revision="b3e5f7a9c1d3"; branch_labels=None; depends_on=None
def upgrade():
    op.add_column("pensionados", sa.Column("created_by", sa.Integer(), nullable=True))
    op.execute("""UPDATE pensionados p SET created_by = COALESCE((SELECT c.asesor_id FROM creditos c WHERE c.pensionado_id=p.id ORDER BY c.id LIMIT 1),(SELECT s.usuario_id FROM seguimientos s WHERE s.pensionado_id=p.id ORDER BY s.id LIMIT 1))""")
    op.create_foreign_key("fk_pensionados_created_by", "pensionados", "usuarios", ["created_by"], ["id"])
    op.create_index("ix_pensionados_created_by", "pensionados", ["created_by"])
def downgrade():
    op.drop_index("ix_pensionados_created_by", table_name="pensionados"); op.drop_constraint("fk_pensionados_created_by", "pensionados", type_="foreignkey"); op.drop_column("pensionados", "created_by")
