"""allow null pensionado profile fields

Revision ID: 0f7e2d9c4b81
Revises: aa31d6e4f8c2
Create Date: 2026-07-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0f7e2d9c4b81"
down_revision = "aa31d6e4f8c2"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("pensionados", "apellidos", existing_type=sa.String(length=150), nullable=True)
    op.alter_column("pensionados", "genero", existing_type=sa.String(length=30), nullable=True)
    op.alter_column("pensionados", "fecha_nacimiento", existing_type=sa.Date(), nullable=True)
    op.alter_column("pensionados", "direccion", existing_type=sa.String(length=200), nullable=True)


def downgrade():
    op.execute("UPDATE pensionados SET apellidos = 'Sin registrar' WHERE apellidos IS NULL")
    op.execute("UPDATE pensionados SET genero = 'No especificado' WHERE genero IS NULL")
    op.execute("UPDATE pensionados SET fecha_nacimiento = DATE '1900-01-01' WHERE fecha_nacimiento IS NULL")
    op.execute("UPDATE pensionados SET direccion = 'Sin registrar' WHERE direccion IS NULL")
    op.alter_column("pensionados", "direccion", existing_type=sa.String(length=200), nullable=False)
    op.alter_column("pensionados", "fecha_nacimiento", existing_type=sa.Date(), nullable=False)
    op.alter_column("pensionados", "genero", existing_type=sa.String(length=30), nullable=False)
    op.alter_column("pensionados", "apellidos", existing_type=sa.String(length=150), nullable=False)
