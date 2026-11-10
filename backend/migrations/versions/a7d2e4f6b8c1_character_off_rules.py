"""character off rules

Revision ID: a7d2e4f6b8c1
Revises: f1c7d3e9a2b4
Create Date: 2026-11-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7d2e4f6b8c1'
down_revision: Union[str, Sequence[str], None] = 'f1c7d3e9a2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.add_column(sa.Column('off_rules', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.drop_column('off_rules')
