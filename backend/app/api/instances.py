"""Personnages en jeu dans une room (instances) et leurs moniteurs de condition.

La fiche est le modèle : quand le MJ accepte un PJ dans une room, une instance est créée avec ses
moniteurs au max (`ensure_instance`). Elle disparaît quand le personnage sort de la room. Si la fiche
change ensuite, les max ne bougent pas tout seuls : `outdated` le signale, `resync` les applique.

Tous les membres voient les moniteurs. Les instances de PJ se modifient par n'importe quel membre ;
celles des autres types (monstres, plus tard) seulement par le MJ. Chaque changement est poussé à la
room : `{"type": "room.instance", "instance": {...}}`.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user, room_or_404
from app.db import get_session
from app.models import CharacterInstance, Room, RoomCharacter, User
from app.realtime.manager import manager, room_channel
from app.rules.monitors import monitor_maxima
from app.schemas import (
    CharacterKind,
    CharacterRead,
    CharacterSummary,
    InstanceRead,
    Monitor,
    MonitorChange,
    RoomCharacterStatus,
)

router = APIRouter(prefix="/rooms", tags=["instances"])


def _sheet_max(link: RoomCharacter) -> dict[str, int]:
    return monitor_maxima(CharacterRead.model_validate(link.character))


def ensure_instance(link: RoomCharacter) -> None:
    """Crée l'instance d'un PJ accepté qui n'en a pas encore, moniteurs au max."""
    if (link.status != RoomCharacterStatus.ACCEPTED or link.instances
            or link.character.kind != CharacterKind.PJ):
        return
    link.instances.append(CharacterInstance(
        monitors={k: {"current": m, "max": m} for k, m in _sheet_max(link).items()}))


def read_instance(instance: CharacterInstance) -> InstanceRead:
    sheet_max = _sheet_max(instance.link)
    monitors = {k: Monitor(**v) for k, v in instance.monitors.items()}
    return InstanceRead(
        id=instance.id, room_id=instance.room_id,
        character=CharacterSummary.model_validate(instance.link.character),
        monitors=monitors, sheet_max=sheet_max,
        outdated=sheet_max != {k: m.max for k, m in monitors.items()},
        updated_at=instance.updated_at,
    )


def _can_edit(room: Room, user: User, instance: CharacterInstance) -> bool:
    return room.gm_id == user.id or instance.link.character.kind == CharacterKind.PJ


def _instance_or_404(session: Session, room_id: int, instance_id: int, user: User) -> CharacterInstance:
    room = room_or_404(session, room_id, user)
    # Verrou de ligne (PostgreSQL) : deux dégâts simultanés s'additionnent au lieu de s'écraser.
    instance = session.scalar(select(CharacterInstance).where(
        CharacterInstance.id == instance_id, CharacterInstance.room_id == room_id).with_for_update())
    if instance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Instance introuvable")
    if not _can_edit(room, user, instance):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ modifie ce personnage")
    return instance


def _save_and_push(session: Session, background: BackgroundTasks, instance: CharacterInstance) -> InstanceRead:
    session.commit()
    read = read_instance(instance)
    background.add_task(manager.broadcast, room_channel(instance.room_id),
                        {"type": "room.instance", "instance": read.model_dump(mode="json")})
    return read


@router.get("/{room_id}/instances", response_model=list[InstanceRead], summary="Personnages en jeu et moniteurs")
def list_instances(room_id: int, user: User = Depends(current_user),
                   session: Session = Depends(get_session)) -> list[InstanceRead]:
    room = room_or_404(session, room_id, user)
    # PJ acceptés avant l'existence des instances : on les met en jeu à la première lecture.
    if any(not rc.instances for rc in room.characters):
        for rc in room.characters:
            ensure_instance(rc)
        if session.new:
            session.commit()
    return [read_instance(i) for rc in room.characters for i in rc.instances]


@router.patch("/{room_id}/instances/{instance_id}", response_model=InstanceRead, summary="Modifier des moniteurs")
def change_monitors(room_id: int, instance_id: int, payload: MonitorChange, background: BackgroundTasks,
                    user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    instance = _instance_or_404(session, room_id, instance_id, user)
    monitors = {k: dict(v) for k, v in instance.monitors.items()}
    unknown = (set(payload.delta) | set(payload.set)) - set(monitors)
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Moniteur(s) inconnu(s) : {', '.join(sorted(unknown))}")
    for key, value in payload.set.items():
        monitors[key]["current"] = value
    for key, delta in payload.delta.items():
        monitors[key]["current"] += delta
    for m in monitors.values():
        m["current"] = max(0, min(m["max"], m["current"]))
    instance.monitors = monitors
    return _save_and_push(session, background, instance)


@router.post("/{room_id}/instances/{instance_id}/resync", response_model=InstanceRead,
             summary="Reprendre les max de la fiche")
def resync_instance(room_id: int, instance_id: int, background: BackgroundTasks,
                    user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    """Les max sont recalculés d'après la fiche, les dégâts subis (max - actuel) sont conservés.
    Un moniteur qui apparaît (mana gagné) commence au max."""
    instance = _instance_or_404(session, room_id, instance_id, user)
    old = instance.monitors
    instance.monitors = {
        k: {"current": max(0, m - (old[k]["max"] - old[k]["current"] if k in old else 0)), "max": m}
        for k, m in _sheet_max(instance.link).items()
    }
    return _save_and_push(session, background, instance)
