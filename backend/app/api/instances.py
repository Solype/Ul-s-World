"""Personnages en jeu dans une room (instances) et leurs moniteurs de condition.

La fiche est le modèle : quand le MJ accepte un PJ dans une room, une instance est créée avec ses
moniteurs au max (`ensure_instance`). Elle disparaît quand le personnage sort de la room. Si la fiche
change ensuite, les max ne bougent pas tout seuls : `outdated` le signale, `resync` les applique.

Tous les membres voient les moniteurs. Les instances de PJ se modifient par n'importe quel membre ;
celles des autres types (monstres, plus tard) seulement par le MJ. Chaque changement est poussé à la
room : `{"type": "room.instance", "instance": {...}}`.
"""

import secrets

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
    StatusCreate,
    StatusRead,
    StatusUpdate,
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


def read_instance(instance: CharacterInstance, gm_view: bool) -> InstanceRead:
    """`gm_view` : vue du MJ, avec les statuts cachés. Sinon ils sont retirés ici, côté serveur."""
    sheet_max = _sheet_max(instance.link)
    monitors = {k: Monitor(**v) for k, v in instance.monitors.items()}
    return InstanceRead(
        id=instance.id, room_id=instance.room_id,
        character=CharacterSummary.model_validate(instance.link.character),
        monitors=monitors, sheet_max=sheet_max,
        statuses=[StatusRead(**s) for s in instance.statuses or [] if gm_view or not s.get("hidden")],
        outdated=sheet_max != {k: m.max for k, m in monitors.items()},
        updated_at=instance.updated_at,
    )


def _is_gm(instance: CharacterInstance, user: User) -> bool:
    return instance.link.room.gm_id == user.id


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


def _save_and_push(session: Session, background: BackgroundTasks, instance: CharacterInstance,
                   user: User) -> InstanceRead:
    """Enregistre et pousse l'instance à la room : vue complète au MJ, sans statuts cachés aux joueurs."""
    session.commit()
    gm_id = instance.link.room.gm_id
    views = {gm: read_instance(instance, gm_view=gm).model_dump(mode="json") for gm in (True, False)}
    background.add_task(manager.broadcast_each, room_channel(instance.room_id),
                        lambda uid: {"type": "room.instance", "instance": views[uid == gm_id]})
    return read_instance(instance, gm_view=user.id == gm_id)


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
    return [read_instance(i, gm_view=room.gm_id == user.id) for rc in room.characters for i in rc.instances]


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
    return _save_and_push(session, background, instance, user)


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
    return _save_and_push(session, background, instance, user)


# --- Statuts ---------------------------------------------------------------------------------------------
# Tags libres sur un personnage en jeu (enflammé, empoisonné...). Un statut public se gère comme les
# moniteurs (tout membre pour un PJ). Un statut caché (`hidden`) est réservé au MJ : lui seul le crée,
# le voit, le retire ou le révèle ; il n'est jamais envoyé aux joueurs.


def _status_or_404(instance: CharacterInstance, status_id: str, user: User) -> dict:
    found = next((s for s in instance.statuses or [] if s["id"] == status_id), None)
    # Un statut caché n'existe pas pour un joueur.
    if found is None or (found.get("hidden") and not _is_gm(instance, user)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Statut introuvable")
    return found


@router.post("/{room_id}/instances/{instance_id}/statuses", response_model=InstanceRead,
             status_code=status.HTTP_201_CREATED, summary="Ajouter un statut")
def add_status(room_id: int, instance_id: int, payload: StatusCreate, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    """Un statut déjà présent (même intitulé, sans tenir compte de la casse) n'est pas ajouté deux fois.
    La comparaison ne porte que sur les statuts que l'on voit : un joueur ne peut pas deviner un statut caché."""
    instance = _instance_or_404(session, room_id, instance_id, user)
    is_gm = _is_gm(instance, user)
    if payload.hidden and not is_gm:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ pose un statut caché")
    label = " ".join(payload.label.split())
    if not label:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Statut vide")
    statuses = list(instance.statuses or [])
    visible = [s for s in statuses if is_gm or not s.get("hidden")]
    if not any(s["label"].casefold() == label.casefold() for s in visible):
        statuses.append({"id": secrets.token_hex(4), "label": label, "hidden": payload.hidden})
        instance.statuses = statuses
    return _save_and_push(session, background, instance, user)


@router.patch("/{room_id}/instances/{instance_id}/statuses/{status_id}", response_model=InstanceRead,
              summary="Cacher ou révéler un statut (MJ)")
def update_status(room_id: int, instance_id: int, status_id: str, payload: StatusUpdate, background: BackgroundTasks,
                  user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    instance = _instance_or_404(session, room_id, instance_id, user)
    if not _is_gm(instance, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ cache ou révèle un statut")
    _status_or_404(instance, status_id, user)
    instance.statuses = [{**s, "hidden": payload.hidden} if s["id"] == status_id else s for s in instance.statuses]
    return _save_and_push(session, background, instance, user)


@router.delete("/{room_id}/instances/{instance_id}/statuses/{status_id}", response_model=InstanceRead,
               summary="Retirer un statut")
def remove_status(room_id: int, instance_id: int, status_id: str, background: BackgroundTasks,
                  user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    instance = _instance_or_404(session, room_id, instance_id, user)
    _status_or_404(instance, status_id, user)
    instance.statuses = [s for s in instance.statuses if s["id"] != status_id]
    return _save_and_push(session, background, instance, user)
