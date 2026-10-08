"""character monster block

Revision ID: fee2f9136231
Revises: 9b27c2a41e9e
Create Date: 2026-10-08 11:48:20.333486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fee2f9136231'
down_revision: Union[str, Sequence[str], None] = '9b27c2a41e9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.add_column(sa.Column('monster', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.drop_column('monster')
