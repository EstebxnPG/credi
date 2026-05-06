"""add document tracking to creditos

Revision ID: 2f4e8d1b9c12
Revises: 8d3a6a4c2f51
Create Date: 2026-05-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2f4e8d1b9c12"
down_revision = "8d3a6a4c2f51"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "creditos",
        sa.Column(
            "tiene_documentos_pendientes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "creditos",
        sa.Column("documentos_pendientes", sa.Text(), nullable=True),
    )
    op.alter_column("creditos", "tiene_documentos_pendientes", server_default=None)


def downgrade() -> None:
    op.drop_column("creditos", "documentos_pendientes")
    op.drop_column("creditos", "tiene_documentos_pendientes")
