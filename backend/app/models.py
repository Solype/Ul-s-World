"""Tables SQL.

Les blocs qui suivent la structure de la fiche (attributs, compétences, rôles...) sont stockés
en JSON : les règles bougent encore, et ajouter une compétence ne doit pas demander de migration.
Les champs sur lesquels on filtre ou trie (nom, type, espèce, dates) restent des colonnes.

PJ, PNJ et monstres partagent la même table : ils ont la même fiche, seuls `kind` et
`creation_mode` les distinguent. `creation` n'est rempli que pour une création selon les règles.
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True, default="pj")
    creation_mode: Mapped[str] = mapped_column(String(10), default="rules")
    species: Mapped[str | None] = mapped_column(String(50), index=True)
    age: Mapped[int | None]
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    magic: Mapped[int] = mapped_column(default=0)
    bottes: Mapped[int] = mapped_column(default=0)
    roles: Mapped[dict] = mapped_column(JSON, default=dict)
    skill_groups: Mapped[dict] = mapped_column(JSON, default=dict)
    skills: Mapped[dict] = mapped_column(JSON, default=dict)
    pools: Mapped[dict] = mapped_column(JSON, default=dict)
    knowledges: Mapped[dict] = mapped_column(JSON, default=dict)
    mana: Mapped[dict] = mapped_column(JSON, default=dict)
    resources: Mapped[dict] = mapped_column(JSON, default=dict)
    selections: Mapped[dict] = mapped_column(JSON, default=dict)
    traits: Mapped[list] = mapped_column(JSON, default=list)
    equipment: Mapped[list] = mapped_column(JSON, default=list)
    relations: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    creation: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
