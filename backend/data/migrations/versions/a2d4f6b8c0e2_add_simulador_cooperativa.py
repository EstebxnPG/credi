"""add simulador cooperativa

Revision ID: a2d4f6b8c0e2
Revises: f0c3d5e7a9b1
"""
from alembic import op
import sqlalchemy as sa
revision="a2d4f6b8c0e2"; down_revision="f0c3d5e7a9b1"; branch_labels=None; depends_on=None
def upgrade(): op.add_column("cooperativas", sa.Column("simulador_url", sa.String(500), nullable=True))
def downgrade(): op.drop_column("cooperativas", "simulador_url")
