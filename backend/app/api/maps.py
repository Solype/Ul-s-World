"""Carte de la room et pions des personnages en jeu.

Le MJ envoie un fichier Universal VTT (export « Universal VTT » de Dungeon Alchemist : .dd2vtt) : image, murs et
portes. Une nouvelle carte remplace l'ancienne et retire tous les pions. Le MJ ouvre et ferme les portes.

Pions : le MJ pose et déplace tout le monde ; un membre, les PJ (comme leurs moniteurs). Vision de groupe : un
joueur ne reçoit que les pions qu'au moins un PJ voit (`map_tokens`), calculé ici, côté serveur.

Temps réel : `room.tokens` (pions, filtrés par destinataire) quand un pion bouge ; `room.map` quand la carte ou
une porte change (les clients relisent `GET .../map` avec leurs droits).
"""

import base64
import binascii

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_user, room_or_404
from app.api.instances import _instance_or_404, map_tokens, push_tokens
from app.db import get_session
from app.models import Room, RoomMap, User
from app.realtime.manager import manager, room_channel
from app.schemas import DoorRead, DoorUpdate, MapRead, TokenMove, TokenRead, UvttFile, UvttPoint

router = APIRouter(prefix="/rooms", tags=["carte"])

MAX_WALLS = 20_000
MAX_DOORS = 2_000
MAX_SIZE = 500  # cases, par côté
# Types d'image acceptés, reconnus à leurs premiers octets (jamais de SVG : il peut porter du script).
IMAGE_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}


def _image_type(data: bytes) -> str | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return next((t for magic, t in IMAGE_TYPES.items() if data.startswith(magic)), None)


def _read(room: Room, gm_view: bool) -> MapRead:
    m = room.map
    return MapRead(id=m.id, width=m.width, height=m.height, pixels_per_grid=m.pixels_per_grid, walls=m.walls,
                   doors=[DoorRead(id=n, a=d["a"], b=d["b"], closed=d["closed"]) for n, d in enumerate(m.doors)],
                   tokens=map_tokens(room, gm_view))


def _map_or_404(room: Room) -> RoomMap:
    if room.map is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas de carte dans cette room")
    return room.map


@router.get("/{room_id}/map", response_model=MapRead | None, summary="Carte de la room (null s'il n'y en a pas)")
def get_map(room_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)) -> MapRead | None:
    room = room_or_404(session, room_id, user)
    return _read(room, gm_view=room.gm_id == user.id) if room.map else None


@router.put("/{room_id}/map", response_model=MapRead, summary="Envoyer la carte, fichier Universal VTT (MJ)")
def upload_map(room_id: int, payload: UvttFile, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> MapRead:
    """Remplace la carte de la room et retire tous les pions."""
    room = room_or_404(session, room_id, user, gm_only=True)
    res = payload.resolution
    if not (0 < res.map_size.x <= MAX_SIZE and 0 < res.map_size.y <= MAX_SIZE):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Carte de 1 à {MAX_SIZE} cases de côté")
    try:
        image = base64.b64decode(payload.image)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Image illisible (base64)") from None
    image_type = _image_type(image)
    if image_type is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "L'image doit être en PNG, JPEG ou WebP")

    ox, oy = res.map_origin.x, res.map_origin.y
    at = lambda p: [round(p.x - ox, 3), round(p.y - oy, 3)]  # noqa: E731

    def segments(lines: list[list[UvttPoint]]) -> list[list[float]]:
        return [at(a) + at(b) for line in lines for a, b in zip(line, line[1:]) if (a.x, a.y) != (b.x, b.y)]

    walls = segments(payload.line_of_sight) + segments(payload.objects_line_of_sight)
    if len(walls) > MAX_WALLS or len(payload.portals) > MAX_DOORS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"Trop de murs ou de portes (au plus {MAX_WALLS} murs, {MAX_DOORS} portes)")

    room.map = None
    session.flush()
    room.map = RoomMap(image=image, image_type=image_type, width=res.map_size.x, height=res.map_size.y,
                       pixels_per_grid=res.pixels_per_grid, walls=walls,
                       doors=[{"a": at(p.bounds[0]), "b": at(p.bounds[1]), "closed": p.closed} for p in payload.portals])
    for rc in room.characters:
        for i in rc.instances:
            i.map_x = i.map_y = None
    session.commit()
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.map"})
    return _read(room, gm_view=True)


@router.get("/{room_id}/map/image", summary="Image de la carte", response_class=Response,
            responses={200: {"content": {"image/png": {}, "image/jpeg": {}, "image/webp": {}}}})
def map_image(room_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)) -> Response:
    """Réservée aux membres. Une nouvelle carte a un nouvel id : l'URL `?v=<id>` change, le cache est donc permanent."""
    m = _map_or_404(room_or_404(session, room_id, user))
    return Response(m.image, media_type=m.image_type,
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.put("/{room_id}/map/doors/{door_id}", response_model=MapRead, summary="Ouvrir ou fermer une porte (MJ)")
def set_door(room_id: int, door_id: int, payload: DoorUpdate, background: BackgroundTasks,
             user: User = Depends(current_user), session: Session = Depends(get_session)) -> MapRead:
    room = room_or_404(session, room_id, user, gm_only=True)
    m = _map_or_404(room)
    if not 0 <= door_id < len(m.doors):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Porte introuvable")
    m.doors = [{**d, "closed": payload.closed} if n == door_id else d for n, d in enumerate(m.doors)]
    session.commit()
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.map"})
    return _read(room, gm_view=True)


@router.put("/{room_id}/instances/{instance_id}/token", response_model=list[TokenRead],
            summary="Poser, déplacer ou retirer un pion de la carte")
def move_token(room_id: int, instance_id: int, payload: TokenMove, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> list[TokenRead]:
    """Le MJ déplace tout pion ; un membre, ceux des PJ. Renvoie les pions tels que les voit l'appelant."""
    instance = _instance_or_404(session, room_id, instance_id, user)
    room = instance.link.room
    m = _map_or_404(room)
    if payload.x is not None and not (0 <= payload.x <= m.width and 0 <= payload.y <= m.height):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pion hors de la carte")
    instance.map_x, instance.map_y = payload.x, payload.y
    session.commit()
    push_tokens(background, room)
    return map_tokens(room, gm_view=room.gm_id == user.id)
