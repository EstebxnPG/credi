"""add credito entidad financiera origen

Revision ID: c7f9a2d4e6b1
Revises: b4e6c8a1d3f0
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7f9a2d4e6b1"
down_revision: Union[str, None] = "b4e6c8a1d3f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "creditos",
        sa.Column("entidad_financiera_origen", sa.String(length=150), nullable=True),
    )
    op.execute(
        """
        UPDATE creditos
        SET tipo_credito = 'Nuevo'
        WHERE tipo_credito IS NULL
           OR btrim(tipo_credito) = ''
           OR tipo_credito NOT IN ('Nuevo', 'Refinanciacion', 'Compra de cartera')
        """
    )


def downgrade() -> None:
    op.drop_column("creditos", "entidad_financiera_origen")
