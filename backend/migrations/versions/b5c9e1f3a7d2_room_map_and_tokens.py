"""room map and tokens

Revision ID: b5c9e1f3a7d2
Revises: a7d2e4f6b8c1
Create Date: 2026-11-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5c9e1f3a7d2'
down_revision: Union[str, Sequence[str], None] = 'a7d2e4f6b8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'room_maps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=False),
        sa.Column('image', sa.LargeBinary(), nullable=False),
        sa.Column('image_type', sa.String(length=20), nullable=False),
        sa.Column('width', sa.Float(), nullable=False),
        sa.Column('height', sa.Float(), nullable=False),
        sa.Column('pixels_per_grid', sa.Integer(), nullable=False),
        sa.Column('walls', sa.JSON(), nullable=False),
        sa.Column('doors', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('room_id'),
    )
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('map_x', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('map_y', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_column('map_y')
        batch_op.drop_column('map_x')
    op.drop_table('room_maps')
