"""add credito motivo finalizacion

Revision ID: 1d9a7c4e2b80
Revises: f8b6c2d4a901
"""
from alembic import op
import sqlalchemy as sa

revision = "1d9a7c4e2b80"
down_revision = "f8b6c2d4a901"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("creditos", sa.Column("motivo_finalizacion", sa.String(length=50), nullable=True))


def downgrade():
    op.drop_column("creditos", "motivo_finalizacion")
