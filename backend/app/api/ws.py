from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import can_access, user_from_token
from app.core.security import SESSION_COOKIE
from app.db import get_session
from app.models import Character
from app.realtime.manager import ALL_CHARACTERS, manager, owner_channel

router = APIRouter(tags=["realtime"])

# Code de fermeture renvoyé quand la connexion est refusée (pas connecté, ou canal interdit).
WS_FORBIDDEN = 4403


def _resolve_channel(session: Session, token: str | None, channel: str) -> str | None:
    """Canal interne auquel brancher le client, ou None s'il n'y a pas droit."""
    try:
        user = user_from_token(session, token)
        if user is None:
            return None
        if channel == "characters":
            return ALL_CHARACTERS if user.is_admin else owner_channel(user.id)
        if channel.startswith("character:") and channel.removeprefix("character:").isdigit():
            character = session.get(Character, int(channel.removeprefix("character:")))
            return channel if character is not None and can_access(user, character) else None
        return None
    finally:
        # Rend la connexion SQL tout de suite : le websocket peut rester ouvert des heures.
        session.close()


@router.websocket("/ws/{channel}")
async def websocket_endpoint(ws: WebSocket, channel: str, session: Session = Depends(get_session)) -> None:
    """Canaux : `characters` (liste de ses personnages, de tous pour un admin) ou `character:<id>`
    (un personnage auquel on a accès). Il faut être connecté (cookie de session) ; sinon la connexion
    est refusée (code 4403).

    Le serveur pousse des événements `{"type": "character.updated", "id": 3}`.
    Les messages reçus du client sont ignorés pour l'instant : c'est ici qu'on branchera
    la suite (dés, chat de table, édition à plusieurs...).
    """
    target = await run_in_threadpool(_resolve_channel, session, ws.cookies.get(SESSION_COOKIE), channel)
    if target is None:
        await ws.close(code=WS_FORBIDDEN)
        return
    await manager.connect(target, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(target, ws)
