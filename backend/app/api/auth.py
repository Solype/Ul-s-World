from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import exists, select, update
from sqlalchemy.orm import Session

from app.api.deps import admin_user, current_user
from app.core.captcha import captcha_enabled, check_captcha
from app.core.config import settings
from app.core.security import SESSION_COOKIE, hash_password, new_session_token, token_hash, verify_password
from app.db import get_session
from app.models import Character, User, UserSession
from app.schemas import CaptchaConfig, Credentials, Registration, UserPublic, UserRead

router = APIRouter(tags=["auth"])

# Session ouverte par un cookie HttpOnly : le navigateur l'envoie tout seul sur /api et /ws,
# et le JavaScript de la page ne peut pas le lire.


def _open_session(session: Session, response: Response, user: User) -> None:
    token = new_session_token()
    max_age = timedelta(days=settings.session_days)
    session.add(UserSession(token_hash=token_hash(token), user_id=user.id, expires_at=datetime.now(UTC) + max_age))
    session.commit()
    response.set_cookie(SESSION_COOKIE, token, max_age=int(max_age.total_seconds()), httponly=True,
                        samesite="lax", secure=settings.cookie_secure, path="/")


@router.get("/auth/captcha", response_model=CaptchaConfig, summary="Configuration du captcha d'inscription")
def captcha_config() -> CaptchaConfig:
    return CaptchaConfig(site_key=settings.turnstile_site_key if captcha_enabled() else None)


@router.post("/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED,
             summary="Créer un compte (et se connecter)")
def register(payload: Registration, response: Response, session: Session = Depends(get_session)) -> User:
    """Le tout premier compte devient administrateur, et récupère les personnages qui n'ont
    pas encore de propriétaire (créés avant les comptes)."""
    check_captcha(payload.captcha_token)
    username = payload.username.lower()
    if session.scalar(select(exists().where(User.username == username))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet identifiant est déjà pris")
    first = not session.scalar(select(exists().where(User.id.is_not(None))))
    user = User(username=username, password_hash=hash_password(payload.password), is_admin=first)
    session.add(user)
    session.flush()
    if first:
        session.execute(update(Character).where(Character.owner_id.is_(None)).values(owner_id=user.id))
    _open_session(session, response, user)
    return user


@router.post("/auth/login", response_model=UserRead, summary="Se connecter")
def login(payload: Credentials, response: Response, session: Session = Depends(get_session)) -> User:
    user = session.scalar(select(User).where(User.username == payload.username.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiant ou mot de passe incorrect")
    _open_session(session, response, user)
    return user


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Se déconnecter")
def logout(response: Response, token: str | None = Cookie(None, alias=SESSION_COOKIE, include_in_schema=False),
           session: Session = Depends(get_session)) -> None:
    if token and (user_session := session.get(UserSession, token_hash(token))):
        session.delete(user_session)
        session.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/auth/me", response_model=UserRead, summary="Compte connecté")
def me(user: User = Depends(current_user)) -> User:
    return user


@router.get("/users", response_model=list[UserPublic], summary="Lister les comptes (admin)")
def list_users(_: User = Depends(admin_user), session: Session = Depends(get_session)) -> list[User]:
    return list(session.scalars(select(User).order_by(User.username)))
