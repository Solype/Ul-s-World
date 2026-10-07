"""knowledges and mana

Revision ID: 43477f0f5a70
Revises: 9fd5fbfc534e
Create Date: 2026-10-07 15:02:47.175614

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43477f0f5a70'
down_revision: Union[str, Sequence[str], None] = '9fd5fbfc534e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Connaissances libres et mana (actuel / max). Voir refdoc/infos.md."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        # server_default pour remplir les lignes existantes.
        batch_op.add_column(sa.Column('knowledges', sa.JSON(), nullable=False, server_default='{}'))
        batch_op.add_column(sa.Column('mana', sa.JSON(), nullable=False, server_default='{"current": 0, "max": 0}'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.drop_column('mana')
        batch_op.drop_column('knowledges')
