"""room groups

Revision ID: f1c7d3e9a2b4
Revises: e8b4f2a9c1d3
Create Date: 2026-10-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1c7d3e9a2b4'
down_revision: Union[str, Sequence[str], None] = 'e8b4f2a9c1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('room_groups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('room_groups', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_room_groups_room_id'), ['room_id'], unique=False)
    # Instances existantes : hors groupe.
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.add_column(sa.Column('group_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_character_instances_group', 'room_groups', ['group_id'], ['id'],
                                    ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_constraint('fk_character_instances_group', type_='foreignkey')
        batch_op.drop_column('group_id')
    with op.batch_alter_table('room_groups', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_room_groups_room_id'))

    op.drop_table('room_groups')
