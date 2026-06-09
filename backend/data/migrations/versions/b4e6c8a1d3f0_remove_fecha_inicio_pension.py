"""remove fecha inicio pension from pensionados

Revision ID: b4e6c8a1d3f0
Revises: a1d4c7e9b230
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b4e6c8a1d3f0"
down_revision: Union[str, None] = "a1d4c7e9b230"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE pensionados DROP COLUMN IF EXISTS fecha_inicio_pension")


def downgrade() -> None:
    op.execute("ALTER TABLE pensionados ADD COLUMN IF NOT EXISTS fecha_inicio_pension date")
    op.execute(
        """
        UPDATE pensionados
        SET fecha_inicio_pension = fecha_nacimiento
        WHERE fecha_inicio_pension IS NULL
        """
    )
    op.execute("ALTER TABLE pensionados ALTER COLUMN fecha_inicio_pension SET NOT NULL")
