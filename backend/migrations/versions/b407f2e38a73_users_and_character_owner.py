"""users and character owner

Revision ID: b407f2e38a73
Revises: 829c6f2ec5dc
Create Date: 2026-10-08 01:03:17.648361

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b407f2e38a73'
down_revision: Union[str, Sequence[str], None] = '829c6f2ec5dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=32), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)

    op.create_table('user_sessions',
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token_hash')
    )
    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_sessions_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_characters_owner_id'), ['owner_id'], unique=False)
        batch_op.create_foreign_key('fk_characters_owner_id_users', 'users', ['owner_id'], ['id'], ondelete='SET NULL')
    # Les personnages existants restent sans propriétaire : le premier admin inscrit les récupère.


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('characters', schema=None) as batch_op:
        batch_op.drop_constraint('fk_characters_owner_id_users', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_characters_owner_id'))
        batch_op.drop_column('owner_id')

    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_sessions_user_id'))

    op.drop_table('user_sessions')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_username'))

    op.drop_table('users')
