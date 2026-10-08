"""instance statuses

Revision ID: 9b27c2a41e9e
Revises: ca1a188ae8cd
Create Date: 2026-10-08 10:35:18.668072

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b27c2a41e9e'
down_revision: Union[str, Sequence[str], None] = 'ca1a188ae8cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('statuses', sa.JSON(), nullable=False, server_default='[]'))



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_column('statuses')

