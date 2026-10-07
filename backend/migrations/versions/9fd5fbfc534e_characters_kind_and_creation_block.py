"""characters kind and creation block

Revision ID: 9fd5fbfc534e
Revises: 59a767f11760
Create Date: 2026-10-07 14:53:19.617252

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9fd5fbfc534e'
down_revision: Union[str, Sequence[str], None] = '59a767f11760'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Vue minimale de la table pour migrer les données sans dépendre des modèles actuels.
characters = sa.table(
    "characters",
    sa.column("id", sa.Integer),
    sa.column("priorities", sa.JSON),
    sa.column("extra_pc", sa.JSON),
    sa.column("money_spent", sa.Integer),
    sa.column("creation", sa.JSON),
)


def upgrade() -> None:
    """PJ/PNJ/monstres dans la même table : ajout de `kind` et `creation_mode`, et regroupement
    des choix de création (priorités, PC restants, sous dépensés) dans un bloc JSON `creation`."""
    with op.batch_alter_table("characters") as batch:
        batch.add_column(sa.Column("kind", sa.String(20), nullable=False, server_default="pj"))
        batch.add_column(sa.Column("creation_mode", sa.String(10), nullable=False, server_default="rules"))
        batch.add_column(sa.Column("creation", sa.JSON(), nullable=True))
        batch.alter_column("species", type_=sa.String(50), existing_type=sa.String(20))
        batch.create_index("ix_characters_kind", ["kind"])

    conn = op.get_bind()
    rows = conn.execute(sa.select(characters.c.id, characters.c.priorities, characters.c.extra_pc,
                                  characters.c.money_spent)).all()
    for row in rows:
        creation = {"priorities": row.priorities or {}, "extra_pc": row.extra_pc or {},
                    "money_spent": row.money_spent or 0}
        conn.execute(characters.update().where(characters.c.id == row.id).values(creation=creation))

    with op.batch_alter_table("characters") as batch:
        batch.drop_column("priorities")
        batch.drop_column("extra_pc")
        batch.drop_column("money_spent")


def downgrade() -> None:
    with op.batch_alter_table("characters") as batch:
        batch.add_column(sa.Column("priorities", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("extra_pc", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("money_spent", sa.Integer(), nullable=False, server_default="0"))

    conn = op.get_bind()
    for row in conn.execute(sa.select(characters.c.id, characters.c.creation)).all():
        creation = row.creation or {}
        conn.execute(characters.update().where(characters.c.id == row.id).values(
            priorities=creation.get("priorities", {}), extra_pc=creation.get("extra_pc", {}),
            money_spent=creation.get("money_spent", 0)))

    with op.batch_alter_table("characters") as batch:
        batch.drop_index("ix_characters_kind")
        batch.drop_column("creation")
        batch.drop_column("creation_mode")
        batch.drop_column("kind")
        batch.alter_column("species", type_=sa.String(20), existing_type=sa.String(50))
