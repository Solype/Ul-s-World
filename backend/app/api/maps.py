"""Cartes de la room et pions des personnages en jeu.

Le MJ ajoute des fichiers Universal VTT (export « Universal VTT » de Dungeon Alchemist : .dd2vtt) : image, murs,
portes et lumières. Il en prépare autant qu'il veut et en montre une aux joueurs (`active`) ; la première ajoutée l'est
d'office. Une carte qui n'est pas montrée n'existe pas pour un joueur (404). Le MJ ouvre et ferme les portes.

Pions : chaque carte garde les siens (`MapToken`). Le MJ pose et déplace tout le monde, sur toute carte ; un membre,
les PJ, sur la carte montrée. Vision de groupe : un joueur ne reçoit que les pions qu'au moins un PJ voit
(`map_tokens`), calculé ici, côté serveur.

Temps réel : `room.maps` quand la liste change (ajout, suppression, carte montrée) ; `room.map` (`id`) quand une
porte change ; `room.tokens` (`map_id`, pions filtrés par destinataire) quand un pion bouge ; `room.ping` (`map_id`,
`x`, `y`, `user_id`) quand quelqu'un montre un endroit de la carte.
"""

import base64
import binascii
import re
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_user, room_or_404
from app.api.instances import _instance_or_404, active_map, map_tokens, push_tokens
from app.db import get_session
from app.models import MapToken, Room, RoomMap, User
from app.realtime.manager import manager, room_channel
from app.schemas import (
    DoorRead, DoorUpdate, LightRead, MapPing, MapRead, MapSummary, MapUpdate, TokenMove, TokenRead, UvttFile, UvttPoint,
)

router = APIRouter(prefix="/rooms", tags=["cartes"])

MAX_WALLS = 20_000
MAX_DOORS = 2_000
MAX_LIGHTS = 500
MAX_SIZE = 500  # cases, par côté
_HEX_COLOR = re.compile(r"(?:[0-9a-fA-F]{2})?([0-9a-fA-F]{6})")


def _light_color(raw: str) -> str:
    """AARRGGBB (Dungeon Alchemist) ou RRGGBB, avec ou sans « # », vers « #rrggbb » ; blanc si illisible.
    L'alpha est ignoré : `intensity` dit déjà la force de la lumière."""
    match = _HEX_COLOR.fullmatch(raw.strip().removeprefix("#"))
    return f"#{match.group(1).lower()}" if match else "#ffffff"
# Types d'image acceptés, reconnus à leurs premiers octets (jamais de SVG : il peut porter du script).
IMAGE_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}


def _image_type(data: bytes) -> str | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return next((t for magic, t in IMAGE_TYPES.items() if data.startswith(magic)), None)


def _read(m: RoomMap, gm_view: bool) -> MapRead:
    return MapRead(id=m.id, name=m.name, active=m.active, width=m.width, height=m.height,
                   pixels_per_grid=m.pixels_per_grid, walls=m.walls,
                   doors=[DoorRead(id=n, a=d["a"], b=d["b"], closed=d["closed"]) for n, d in enumerate(m.doors)],
                   lights=[LightRead(**light) for light in m.lights or []],
                   tokens=map_tokens(m, gm_view))


def _map_or_404(room: Room, map_id: int, user: User) -> RoomMap:
    """Une carte de la room ; pour un joueur, seulement celle qu'on lui montre."""
    m = next((m for m in room.maps if m.id == map_id), None)
    if m is None or (room.gm_id != user.id and not m.active):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable")
    return m


def _notify_maps(background: BackgroundTasks, room_id: int) -> None:
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.maps"})


@router.get("/{room_id}/maps", response_model=list[MapSummary], summary="Cartes de la room")
def list_maps(room_id: int, user: User = Depends(current_user),
              session: Session = Depends(get_session)) -> list[MapSummary]:
    """Toutes pour le MJ ; pour un joueur, celle qu'on lui montre (ou aucune)."""
    room = room_or_404(session, room_id, user)
    return [MapSummary.model_validate(m) for m in room.maps if room.gm_id == user.id or m.active]


@router.post("/{room_id}/maps", response_model=MapRead, status_code=status.HTTP_201_CREATED,
             summary="Ajouter une carte, fichier Universal VTT (MJ)")
def add_map(room_id: int, payload: UvttFile, background: BackgroundTasks,
            name: Annotated[str, Query(min_length=1, max_length=100)] = "Carte",
            user: User = Depends(current_user), session: Session = Depends(get_session)) -> MapRead:
    """La première carte de la room est montrée aux joueurs d'office ; les suivantes attendent que le MJ les montre."""
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
    if len(walls) > MAX_WALLS or len(payload.portals) > MAX_DOORS or len(payload.lights) > MAX_LIGHTS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"Trop de murs, de portes ou de lumières (au plus {MAX_WALLS} murs, {MAX_DOORS} portes, "
                            f"{MAX_LIGHTS} lumières)")
    lights = [{"x": x, "y": y, "range": light.range, "intensity": light.intensity, "color": _light_color(light.color)}
              for light in payload.lights for x, y in [at(light.position)]]

    m = RoomMap(name=" ".join(name.split()) or "Carte", active=active_map(room) is None, image=image,
                image_type=image_type, width=res.map_size.x, height=res.map_size.y,
                pixels_per_grid=res.pixels_per_grid, walls=walls,
                doors=[{"a": at(p.bounds[0]), "b": at(p.bounds[1]), "closed": p.closed} for p in payload.portals],
                lights=lights)
    room.maps.append(m)
    session.commit()
    _notify_maps(background, room_id)
    return _read(m, gm_view=True)


@router.get("/{room_id}/maps/{map_id}", response_model=MapRead, summary="Une carte, avec ses portes et ses pions")
def get_map(room_id: int, map_id: int, user: User = Depends(current_user),
            session: Session = Depends(get_session)) -> MapRead:
    room = room_or_404(session, room_id, user)
    return _read(_map_or_404(room, map_id, user), gm_view=room.gm_id == user.id)


@router.patch("/{room_id}/maps/{map_id}", response_model=list[MapSummary],
              summary="Montrer une carte aux joueurs, ou ne plus leur en montrer (MJ)")
def update_map(room_id: int, map_id: int, payload: MapUpdate, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> list[MapSummary]:
    room = room_or_404(session, room_id, user, gm_only=True)
    target = _map_or_404(room, map_id, user)
    for m in room.maps:
        m.active = payload.active and m is target
    session.commit()
    _notify_maps(background, room_id)
    return [MapSummary.model_validate(m) for m in room.maps]


@router.delete("/{room_id}/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer une carte (MJ)")
def delete_map(room_id: int, map_id: int, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> None:
    """Ses pions partent avec elle. Si c'était la carte montrée, les joueurs n'en ont plus."""
    room = room_or_404(session, room_id, user, gm_only=True)
    room.maps.remove(_map_or_404(room, map_id, user))
    session.commit()
    _notify_maps(background, room_id)


@router.get("/{room_id}/maps/{map_id}/image", summary="Image d'une carte", response_class=Response,
            responses={200: {"content": {"image/png": {}, "image/jpeg": {}, "image/webp": {}}}})
def map_image(room_id: int, map_id: int, user: User = Depends(current_user),
              session: Session = Depends(get_session)) -> Response:
    """Mêmes droits que la carte. L'image d'une carte ne change jamais : cache sans revalidation. `private` : le
    navigateur la garde, aucun cache partagé (elle est réservée aux membres)."""
    m = _map_or_404(room_or_404(session, room_id, user), map_id, user)
    return Response(m.image, media_type=m.image_type,
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.put("/{room_id}/maps/{map_id}/doors/{door_id}", response_model=MapRead, summary="Ouvrir ou fermer une porte (MJ)")
def set_door(room_id: int, map_id: int, door_id: int, payload: DoorUpdate, background: BackgroundTasks,
             user: User = Depends(current_user), session: Session = Depends(get_session)) -> MapRead:
    room = room_or_404(session, room_id, user, gm_only=True)
    m = _map_or_404(room, map_id, user)
    if not 0 <= door_id < len(m.doors):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Porte introuvable")
    m.doors = [{**d, "closed": payload.closed} if n == door_id else d for n, d in enumerate(m.doors)]
    session.commit()
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.map", "id": m.id})
    return _read(m, gm_view=True)


@router.put("/{room_id}/maps/{map_id}/tokens/{instance_id}", response_model=list[TokenRead],
            summary="Poser, déplacer ou retirer un pion d'une carte")
def move_token(room_id: int, map_id: int, instance_id: int, payload: TokenMove, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> list[TokenRead]:
    """Le MJ déplace tout pion ; un membre, ceux des PJ. Renvoie les pions de la carte tels que les voit l'appelant."""
    instance = _instance_or_404(session, room_id, instance_id, user)
    room = instance.link.room
    m = _map_or_404(room, map_id, user)
    if payload.x is not None and not (0 <= payload.x <= m.width and 0 <= payload.y <= m.height):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pion hors de la carte")
    token = next((t for t in m.tokens if t.instance_id == instance_id), None)
    if payload.x is None:
        if token is not None:
            m.tokens.remove(token)
    elif token is None:
        m.tokens.append(MapToken(instance=instance, x=payload.x, y=payload.y))
    else:
        token.x, token.y = payload.x, payload.y
    session.commit()
    push_tokens(background, m, room.gm_id)
    return map_tokens(m, gm_view=room.gm_id == user.id)


@router.post("/{room_id}/maps/{map_id}/ping", status_code=status.HTTP_204_NO_CONTENT,
             summary="Montrer un endroit de la carte aux autres")
def ping(room_id: int, map_id: int, payload: MapPing, background: BackgroundTasks,
         user: User = Depends(current_user), session: Session = Depends(get_session)) -> None:
    """Signal éphémère, rien n'est enregistré. Le MJ le reçoit toujours ; les joueurs, seulement sur la carte qu'on
    leur montre : un ping du MJ sur une carte qu'il prépare ne leur dit rien."""
    room = room_or_404(session, room_id, user)
    m = _map_or_404(room, map_id, user)
    if not (0 <= payload.x <= m.width and 0 <= payload.y <= m.height):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Endroit hors de la carte")
    event = {"type": "room.ping", "map_id": m.id, "x": payload.x, "y": payload.y, "user_id": user.id}
    gm_id, shown = room.gm_id, m.active
    background.add_task(manager.broadcast_each, room_channel(room_id),
                        lambda uid: event if uid == gm_id or shown else None)
