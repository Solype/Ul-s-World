"""Dépendances partagées par les routes : utilisateur connecté, droits sur un personnage ou une room."""

from datetime import UTC, datetime

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.core.security import SESSION_COOKIE, token_hash
from app.db import get_session
from app.models import Character, Room, RoomCharacter, RoomMember, User, UserSession


def user_from_token(session: Session, token: str | None) -> User | None:
    """Compte lié au jeton de session, ou None si le jeton est absent, inconnu ou expiré."""
    if not token:
        return None
    user_session = session.get(UserSession, token_hash(token))
    if user_session is None:
        return None
    expires_at = user_session.expires_at
    if expires_at.tzinfo is None:  # SQLite ne garde pas le fuseau horaire
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        session.delete(user_session)
        session.commit()
        return None
    return user_session.user


def current_user(
    token: str | None = Cookie(None, alias=SESSION_COOKIE, include_in_schema=False),
    session: Session = Depends(get_session),
) -> User:
    """Compte connecté (cookie de session). 401 sinon."""
    user = user_from_token(session, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé aux administrateurs")
    return user


def can_edit(user: User, character: Character) -> bool:
    """Modifier ou supprimer : le propriétaire et les admins."""
    return user.is_admin or character.owner_id == user.id


def can_view(session: Session, user: User, character: Character) -> bool:
    """Lire la fiche : ceux qui peuvent la modifier, les membres (et le MJ) d'une room où le
    personnage est intégré, et le MJ d'une room où il est proposé (pour décider)."""
    if can_edit(user, character):
        return True
    in_room_of_user = or_(
        Room.gm_id == user.id,
        and_(RoomCharacter.status == "accepted",
             exists().where(RoomMember.room_id == Room.id, RoomMember.user_id == user.id)),
    )
    query = (select(RoomCharacter).join(Room)
             .where(RoomCharacter.character_id == character.id, in_room_of_user).exists())
    return bool(session.scalar(select(query)))


def is_room_member(room: Room, user: User) -> bool:
    """Le MJ ou un joueur de la room."""
    return room.gm_id == user.id or any(m.user_id == user.id for m in room.members)


def room_or_404(session: Session, room_id: int, user: User, gm_only: bool = False) -> Room:
    """404 si on n'est pas membre (la room n'existe pas pour nous), 403 si l'action est réservée au MJ."""
    room = session.get(Room, room_id)
    if room is None or not is_room_member(room, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room introuvable")
    if gm_only and room.gm_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé au MJ de la room")
    return room
