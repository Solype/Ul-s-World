"""character traits

Revision ID: 829c6f2ec5dc
Revises: 11545adaad86
Create Date: 2026-10-07 23:34:27.060780

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '829c6f2ec5dc'
down_revision: Union[str, Sequence[str], None] = '11545adaad86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.add_column(sa.Column('traits', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.drop_column('traits')
