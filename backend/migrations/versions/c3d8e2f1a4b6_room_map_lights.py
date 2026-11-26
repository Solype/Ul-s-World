"""room map lights

Revision ID: c3d8e2f1a4b6
Revises: b5c9e1f3a7d2
Create Date: 2026-11-26 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d8e2f1a4b6'
down_revision: Union[str, Sequence[str], None] = 'b5c9e1f3a7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Lumières des cartes Universal VTT. Les cartes déjà importées n'en ont pas : liste vide."""
    op.add_column('room_maps', sa.Column('lights', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    op.drop_column('room_maps', 'lights')
