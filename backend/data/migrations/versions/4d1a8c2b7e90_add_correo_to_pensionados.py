"""add correo to pensionados

Revision ID: 4d1a8c2b7e90
Revises: b7c9d2f4a6e1
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4d1a8c2b7e90"
down_revision: Union[str, None] = "b7c9d2f4a6e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pensionados", sa.Column("correo", sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column("pensionados", "correo")
