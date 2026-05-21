"""add pensionado identity fields

Revision ID: b7c9d2f4a6e1
Revises: 9c71a4f5d2b0
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c9d2f4a6e1"
down_revision: Union[str, None] = "9c71a4f5d2b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pensionados", sa.Column("segundo_nombre", sa.String(length=150), nullable=True))
    op.add_column("pensionados", sa.Column("apellidos", sa.String(length=150), nullable=True))
    op.add_column("pensionados", sa.Column("genero", sa.String(length=30), nullable=True))

    op.execute(
        """
        UPDATE pensionados
        SET
            nombre = split_part(trim(nombre), ' ', 1),
            apellidos = NULLIF(trim(substr(trim(nombre), length(split_part(trim(nombre), ' ', 1)) + 1)), ''),
            genero = 'No especificado'
        """
    )
    op.execute("UPDATE pensionados SET apellidos = 'Sin registrar' WHERE apellidos IS NULL")

    op.alter_column("pensionados", "apellidos", existing_type=sa.String(length=150), nullable=False)
    op.alter_column("pensionados", "genero", existing_type=sa.String(length=30), nullable=False)


def downgrade() -> None:
    op.execute(
        """
        UPDATE pensionados
        SET nombre = trim(concat_ws(' ', nombre, segundo_nombre, apellidos))
        """
    )
    op.drop_column("pensionados", "genero")
    op.drop_column("pensionados", "apellidos")
    op.drop_column("pensionados", "segundo_nombre")
