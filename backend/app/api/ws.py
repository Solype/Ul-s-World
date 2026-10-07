from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.deps import can_edit, is_room_member, user_from_token
from app.core.security import SESSION_COOKIE
from app.db import get_session
from app.models import Character, Room
from app.realtime.manager import ALL_CHARACTERS, broadcast_presence, manager, owner_channel

router = APIRouter(tags=["realtime"])

# Code de fermeture renvoyé quand la connexion est refusée (pas connecté, ou canal interdit).
WS_FORBIDDEN = 4403


def _numeric_suffix(channel: str, prefix: str) -> int | None:
    rest = channel.removeprefix(prefix)
    return int(rest) if channel.startswith(prefix) and rest.isdigit() else None


def _resolve_channel(session: Session, token: str | None, channel: str) -> tuple[str, int, int | None] | None:
    """(canal interne, compte, room) auquel brancher le client, ou None s'il n'y a pas droit."""
    try:
        user = user_from_token(session, token)
        if user is None:
            return None
        if channel == "characters":
            return (ALL_CHARACTERS if user.is_admin else owner_channel(user.id)), user.id, None
        if (character_id := _numeric_suffix(channel, "character:")) is not None:
            character = session.get(Character, character_id)
            return (channel, user.id, None) if character is not None and can_edit(user, character) else None
        if (room_id := _numeric_suffix(channel, "room:")) is not None:
            room = session.get(Room, room_id)
            return (channel, user.id, room_id) if room is not None and is_room_member(room, user) else None
        return None
    finally:
        # Rend la connexion SQL tout de suite : le websocket peut rester ouvert des heures.
        session.close()


@router.websocket("/ws/{channel}")
async def websocket_endpoint(ws: WebSocket, channel: str, session: Session = Depends(get_session)) -> None:
    """Il faut être connecté (cookie de session) ; sinon, ou sans droit sur le canal, la connexion
    est refusée (code 4403). Canaux :

    - `characters` : liste de ses personnages (de tous pour un admin) ;
    - `character:<id>` : un de ses personnages ;
    - `room:<id>` : une room dont on est membre ou MJ. Le serveur y pousse la présence
      (`{"type": "room.presence", "online": [ids]}`) et le chat (`{"type": "room.message", "message": {...}}`).
      Les messages s'envoient par `POST /api/rooms/{id}/messages`, qui les enregistre.

    Les messages reçus du client sont ignorés pour l'instant.
    """
    resolved = await run_in_threadpool(_resolve_channel, session, ws.cookies.get(SESSION_COOKIE), channel)
    if resolved is None:
        # Accepter puis fermer : refusée avant `accept`, la connexion échouerait en HTTP 403 et le
        # navigateur ne verrait qu'un code 1006, pas 4403.
        await ws.accept()
        await ws.close(code=WS_FORBIDDEN)
        return
    target, user_id, room_id = resolved
    await manager.connect(target, ws, user_id)
    if room_id is not None:
        await broadcast_presence(room_id)
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, RuntimeError):  # RuntimeError : fermée par le serveur (`manager.kick`)
        manager.disconnect(target, ws)
        if room_id is not None:
            await broadcast_presence(room_id)
