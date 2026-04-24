"""fix timestamp defaults

Revision ID: 8d3a6a4c2f51
Revises: 3a67bc66d79a
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8d3a6a4c2f51"
down_revision: Union[str, None] = "3a67bc66d79a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    statements = [
        "ALTER TABLE creditos ALTER COLUMN fecha_registro SET DEFAULT now()",
        "ALTER TABLE logs ALTER COLUMN created_at SET DEFAULT now()",
        "ALTER TABLE documentos ALTER COLUMN created_at SET DEFAULT now()",
        "ALTER TABLE historial_creditos ALTER COLUMN created_at SET DEFAULT now()",
        "ALTER TABLE refinanciaciones ALTER COLUMN created_at SET DEFAULT now()",
    ]
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    statements = [
        "ALTER TABLE creditos ALTER COLUMN fecha_registro SET DEFAULT 'now()'",
        "ALTER TABLE logs ALTER COLUMN created_at SET DEFAULT 'now()'",
        "ALTER TABLE documentos ALTER COLUMN created_at SET DEFAULT 'now()'",
        "ALTER TABLE historial_creditos ALTER COLUMN created_at SET DEFAULT 'now()'",
        "ALTER TABLE refinanciaciones ALTER COLUMN created_at SET DEFAULT 'now()'",
    ]
    for statement in statements:
        op.execute(statement)
