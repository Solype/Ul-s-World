"""character instances and monitors

Revision ID: ca1a188ae8cd
Revises: 8afa83f6b485
Create Date: 2026-10-08 02:21:15.461507

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca1a188ae8cd'
down_revision: Union[str, Sequence[str], None] = '8afa83f6b485'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('character_instances',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('character_id', sa.Integer(), nullable=False),
    sa.Column('monitors', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['room_id', 'character_id'], ['room_characters.room_id', 'room_characters.character_id'], name='fk_character_instances_room_character', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_character_instances_character_id'), ['character_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_character_instances_room_id'), ['room_id'], unique=False)



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('character_instances', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_character_instances_room_id'))
        batch_op.drop_index(batch_op.f('ix_character_instances_character_id'))

    op.drop_table('character_instances')
