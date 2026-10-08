"""instance visibility

Revision ID: 31f46d3b5b50
Revises: fee2f9136231
Create Date: 2026-10-08 12:57:04.624485

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '31f46d3b5b50'
down_revision: Union[str, Sequence[str], None] = 'fee2f9136231'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('visibility', sa.String(length=10), nullable=False, server_default='revele'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_column('visibility')
