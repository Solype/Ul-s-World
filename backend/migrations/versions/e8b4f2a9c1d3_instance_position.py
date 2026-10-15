"""instance position

Revision ID: e8b4f2a9c1d3
Revises: d3a1c0e5f7b2
Create Date: 2026-10-15 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b4f2a9c1d3'
down_revision: Union[str, Sequence[str], None] = 'd3a1c0e5f7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    # Instances existantes : dans l'ordre de leur création.
    op.execute("UPDATE character_instances SET position = id")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_column('position')
