"""rooms, members, characters and chat

Revision ID: 8afa83f6b485
Revises: b407f2e38a73
Create Date: 2026-10-08 01:22:49.725954

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8afa83f6b485'
down_revision: Union[str, Sequence[str], None] = 'b407f2e38a73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('rooms',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('gm_id', sa.Integer(), nullable=False),
    sa.Column('invite_code', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['gm_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('rooms', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_rooms_gm_id'), ['gm_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_rooms_invite_code'), ['invite_code'], unique=True)

    op.create_table('chat_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_messages_room_id'), ['room_id'], unique=False)

    op.create_table('room_characters',
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('character_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('room_id', 'character_id')
    )
    with op.batch_alter_table('room_characters', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_room_characters_character_id'), ['character_id'], unique=False)

    op.create_table('room_members',
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('room_id', 'user_id')
    )
    with op.batch_alter_table('room_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_room_members_user_id'), ['user_id'], unique=False)



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('room_members', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_room_members_user_id'))

    op.drop_table('room_members')
    with op.batch_alter_table('room_characters', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_room_characters_character_id'))

    op.drop_table('room_characters')
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_messages_room_id'))

    op.drop_table('chat_messages')
    with op.batch_alter_table('rooms', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_rooms_invite_code'))
        batch_op.drop_index(batch_op.f('ix_rooms_gm_id'))

    op.drop_table('rooms')
