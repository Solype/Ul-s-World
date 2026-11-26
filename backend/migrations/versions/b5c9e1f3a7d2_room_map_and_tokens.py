"""room maps and tokens

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
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
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
    )
    op.create_index('ix_room_maps_room_id', 'room_maps', ['room_id'])
    op.create_table(
        'map_tokens',
        sa.Column('map_id', sa.Integer(), nullable=False),
        sa.Column('instance_id', sa.Integer(), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['map_id'], ['room_maps.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['instance_id'], ['character_instances.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('map_id', 'instance_id'),
    )
    op.create_index('ix_map_tokens_instance_id', 'map_tokens', ['instance_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_map_tokens_instance_id', table_name='map_tokens')
    op.drop_table('map_tokens')
    op.drop_index('ix_room_maps_room_id', table_name='room_maps')
    op.drop_table('room_maps')
