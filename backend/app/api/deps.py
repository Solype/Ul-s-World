"""Dépendances partagées par les routes : utilisateur connecté, droits sur un personnage."""

from datetime import UTC, datetime

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import SESSION_COOKIE, token_hash
from app.db import get_session
from app.models import Character, User, UserSession


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


def can_access(user: User, character: Character) -> bool:
    """Le propriétaire et les admins. Les rooms élargiront ce droit aux joueurs d'une même table."""
    return user.is_admin or character.owner_id == user.id
