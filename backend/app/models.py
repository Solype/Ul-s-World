"""Tables SQL.

Les blocs qui suivent la structure de la fiche (attributs, compétences, rôles...) sont stockés
en JSON : les règles bougent encore, et ajouter une compétence ne doit pas demander de migration.
Les champs sur lesquels on filtre ou trie (nom, type, espèce, dates) restent des colonnes.

PJ, PNJ et monstres partagent la même table : ils ont la même fiche, seuls `kind` et
`creation_mode` les distinguent. `creation` n'est rempli que pour une création selon les règles.

Chaque personnage a un propriétaire (`owner_id`), le compte qui l'a créé. La colonne accepte NULL
pour les personnages créés avant les comptes : ils sont rattachés au premier admin à son inscription.
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Stocké en minuscules : « Alice » et « alice » sont le même compte.
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserSession(Base):
    """Session de connexion. Seule l'empreinte (SHA-256) du jeton est stockée, le jeton lui-même
    n'existe que dans le cookie du navigateur."""

    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="joined")


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    owner: Mapped[User | None] = relationship(lazy="joined")
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
    # Rooms où le personnage est proposé ou accepté : supprimé avec lui.
    room_links: Mapped[list["RoomCharacter"]] = relationship(back_populates="character", cascade="all, delete-orphan")


class Room(Base):
    """Table de jeu. Son créateur en est le MJ ; les joueurs la rejoignent par code ou sont ajoutés par le MJ."""

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    gm_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    gm: Mapped[User] = relationship(lazy="joined")
    # Code d'invitation, sans tiret ni minuscule (affiché `ABCD-EFGH`). Le MJ peut en générer un nouveau.
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    members: Mapped[list["RoomMember"]] = relationship(back_populates="room", cascade="all, delete-orphan",
                                                     lazy="selectin", order_by="RoomMember.joined_at")
    characters: Mapped[list["RoomCharacter"]] = relationship(back_populates="room", cascade="all, delete-orphan",
                                                           lazy="selectin", order_by="RoomCharacter.created_at")
    messages: Mapped[list["ChatMessage"]] = relationship(cascade="all, delete-orphan")


class RoomMember(Base):
    """Joueur d'une room (le MJ n'y figure pas : c'est `Room.gm`)."""

    __tablename__ = "room_members"

    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    room: Mapped[Room] = relationship(back_populates="members")
    user: Mapped[User] = relationship(lazy="joined")


class RoomCharacter(Base):
    """Personnage proposé (`pending`) ou intégré (`accepted`) à une room. Un refus supprime la ligne."""

    __tablename__ = "room_characters"

    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"), primary_key=True,
                                              index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    room: Mapped[Room] = relationship(back_populates="characters")
    character: Mapped[Character] = relationship(back_populates="room_links", lazy="joined")


class ChatMessage(Base):
    """Message du chat de table, conservé pour l'historique."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author: Mapped[User | None] = relationship(lazy="joined")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
