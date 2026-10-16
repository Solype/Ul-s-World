"""Personnages en jeu dans une room (instances) et leurs moniteurs de condition.

La fiche est le modèle : quand le MJ accepte un PJ dans une room, une instance est créée avec ses
moniteurs au max (`ensure_instance`). Elle disparaît quand le personnage sort de la room. Si la fiche
change ensuite, les max ne bougent pas tout seuls : `outdated` le signale, `resync` les applique.

Les instances de PJ se modifient par n'importe quel membre ; celles des autres types seulement par le MJ.
Chaque changement est poussé à la room : `{"type": "room.instance", "instance": {...}}`.

Monstres : le MJ les met en jeu lui-même (`POST .../instances`), un de ses monstres ou un monstre de joueur
accepté, autant d'exemplaires qu'il veut. Leur visibilité (`InstanceVisibility`) est filtrée ici, côté
serveur : caché, un monstre n'est jamais envoyé aux joueurs (ils reçoivent `room.instance.removed` quand il
disparaît de leur vue) ; visible, il leur arrive sans moniteurs ; révélé, entier.

Disposition : le MJ place les cartes et les range en groupes (`PUT .../instances/layout`). Un nouveau personnage
en jeu arrive hors groupe, à la fin.
"""

import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user, room_or_404
from app.db import get_session
from app.models import Character, CharacterInstance, Room, RoomCharacter, RoomGroup, User
from app.realtime.manager import manager, room_channel
from app.rules.catalogs import CATALOGS, GodResourceDef
from app.rules.monitors import monitor_maxima
from app.schemas import (
    CharacterKind,
    CharacterRead,
    CharacterSummary,
    GodResourceChange,
    GodResourceValue,
    GroupRead,
    InstanceLayout,
    InstanceRead,
    InstanceVisibility,
    LayoutRead,
    Monitor,
    MonsterAdd,
    MonitorChange,
    RoomCharacterStatus,
    StatusCreate,
    StatusRead,
    StatusUpdate,
    VisibilityUpdate,
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
        monitors={k: {"current": m, "max": m} for k, m in _sheet_max(link).items()},
        position=_next_position(link.room)))


def _next_position(room: Room) -> int:
    """Une nouvelle instance arrive après toutes celles de la room."""
    return max((i.position for rc in room.characters for i in rc.instances), default=-1) + 1


def visible_to_players(instance: CharacterInstance) -> bool:
    return instance.visibility != InstanceVisibility.CACHE


def read_instance(instance: CharacterInstance, gm_view: bool) -> InstanceRead:
    """`gm_view` : vue du MJ, complète. Pour un joueur, on retire ici, côté serveur, les statuts cachés et,
    tant que le personnage n'est pas révélé, ses moniteurs et son armure naturelle. Un personnage caché
    ne doit pas être lu pour un joueur (`visible_to_players`)."""
    character = instance.link.character
    full = gm_view or instance.visibility == InstanceVisibility.REVELE
    sheet_max = _sheet_max(instance.link) if full else {}
    monitors = {k: Monitor(**v) for k, v in instance.monitors.items()} if full else {}
    siblings = instance.link.instances
    armor = (character.monster or {}).get("natural_armor", 0) if character.kind == CharacterKind.MONSTRE else None
    return InstanceRead(
        id=instance.id, room_id=instance.room_id,
        character=CharacterSummary.model_validate(character),
        monitors=monitors, sheet_max=sheet_max,
        statuses=[StatusRead(**s) for s in instance.statuses or [] if gm_view or not s.get("hidden")],
        outdated=full and sheet_max != {k: m.max for k, m in monitors.items()},
        visibility=instance.visibility,
        number=siblings.index(instance) + 1 if len(siblings) > 1 and instance in siblings else None,
        natural_armor=armor if full else None,
        god_resources=_god_resources(instance) if full else [],
        position=instance.position, group_id=instance.group_id,
        updated_at=instance.updated_at,
    )


def _god_resource_defs(character: Character) -> dict[tuple[str, str], GodResourceDef]:
    """Ressources propres aux dieux choisis sur la fiche, par (dieu, ressource), dans l'ordre de la fiche."""
    catalog = {g.label: g for g in CATALOGS["dieux"]}
    return {(pick["name"], r.name): r
            for pick in (character.selections or {}).get("dieux", [])
            for r in (catalog[pick["name"]].resources if pick["name"] in catalog else [])}


def _god_resources(instance: CharacterInstance) -> list[GodResourceValue]:
    """Les ressources viennent des dieux de la fiche ; leurs valeurs sont celles de la room (0 si jamais modifiée)."""
    values = instance.god_resources or {}
    return [GodResourceValue(god=god, name=name, value=values.get(god, {}).get(name, 0), max=r.max)
            for (god, name), r in _god_resource_defs(instance.link.character).items()]


def push_instance(background: BackgroundTasks, instance: CharacterInstance) -> None:
    """Pousse l'instance à sa room : vue complète au MJ, vue filtrée aux joueurs (ou sa disparition si cachée)."""
    gm_id = instance.link.room.gm_id
    gm_event = {"type": "room.instance", "instance": read_instance(instance, gm_view=True).model_dump(mode="json")}
    player_event = _player_event(instance)
    background.add_task(manager.broadcast_each, room_channel(instance.room_id),
                        lambda uid: gm_event if uid == gm_id else player_event)


def _player_event(instance: CharacterInstance) -> dict:
    """Ce qu'un joueur reçoit quand une instance change : elle, ou sa disparition si elle est cachée."""
    if not visible_to_players(instance):
        return {"type": "room.instance.removed", "id": instance.id}
    return {"type": "room.instance", "instance": read_instance(instance, gm_view=False).model_dump(mode="json")}


def _is_gm(instance: CharacterInstance, user: User) -> bool:
    return instance.link.room.gm_id == user.id


def _can_edit(room: Room, user: User, instance: CharacterInstance) -> bool:
    return room.gm_id == user.id or instance.link.character.kind == CharacterKind.PJ


def _instance_or_404(session: Session, room_id: int, instance_id: int, user: User) -> CharacterInstance:
    room = room_or_404(session, room_id, user)
    # Verrou de ligne (PostgreSQL) : deux dégâts simultanés s'additionnent au lieu de s'écraser.
    instance = session.scalar(select(CharacterInstance).where(
        CharacterInstance.id == instance_id, CharacterInstance.room_id == room_id).with_for_update())
    # Un monstre caché n'existe pas pour un joueur.
    if instance is None or (room.gm_id != user.id and not visible_to_players(instance)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Instance introuvable")
    if not _can_edit(room, user, instance):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ modifie ce personnage")
    return instance


def _save_and_push(session: Session, background: BackgroundTasks, instance: CharacterInstance,
                   user: User) -> InstanceRead:
    """Enregistre et pousse l'instance à la room : vue complète au MJ, sans statuts cachés aux joueurs."""
    session.commit()
    push_instance(background, instance)
    return read_instance(instance, gm_view=user.id == instance.link.room.gm_id)


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
    gm_view = room.gm_id == user.id
    return [read_instance(i, gm_view=gm_view) for i in _ordered(room) if gm_view or visible_to_players(i)]


def _ordered(room: Room) -> list[CharacterInstance]:
    """Les instances de la room dans l'ordre choisi par le MJ."""
    return sorted((i for rc in room.characters for i in rc.instances), key=lambda i: (i.position, i.id))


@router.get("/{room_id}/groups", response_model=list[GroupRead], summary="Groupes de personnages en jeu")
def list_groups(room_id: int, user: User = Depends(current_user),
                session: Session = Depends(get_session)) -> list[GroupRead]:
    """Tous pour le MJ. Un joueur ne voit que les groupes où il voit au moins un personnage : le nom d'un groupe
    de monstres cachés ne doit pas lui parvenir."""
    room = room_or_404(session, room_id, user)
    if room.gm_id == user.id:
        return [GroupRead.model_validate(g) for g in room.groups]
    seen = {i.group_id for rc in room.characters for i in rc.instances if visible_to_players(i)}
    return [GroupRead.model_validate(g) for g in room.groups if g.id in seen]


@router.put("/{room_id}/instances/layout", response_model=LayoutRead,
            summary="Placer et grouper les personnages en jeu (MJ)")
def set_layout(room_id: int, payload: InstanceLayout, background: BackgroundTasks,
               user: User = Depends(current_user), session: Session = Depends(get_session)) -> LayoutRead:
    """Toute la disposition d'un coup : chaque instance de la room une fois, hors groupe (`loose`) ou dans un
    groupe. Un groupe sans `id` est créé, un groupe existant absent est dissous, un nom changé est renommé.
    La même pour tous ; les membres sont prévenus (`room.instances.layout`) et relisent avec leurs droits."""
    room = room_or_404(session, room_id, user, gm_only=True)
    instances = {i.id: i for i in _ordered(room)}
    placed = payload.loose + [i for g in payload.groups for i in g.ids]
    if sorted(placed) != sorted(instances):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "La disposition doit donner chaque personnage en jeu de la room, une seule fois")
    existing = {g.id: g for g in room.groups}
    kept = [g.id for g in payload.groups if g.id is not None]
    if len(set(kept)) != len(kept) or not set(kept) <= set(existing):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Groupe inconnu dans cette room, ou donné deux fois")
    groups = []
    for position, g in enumerate(payload.groups):
        group = existing[g.id] if g.id is not None else RoomGroup(room_id=room.id)
        group.name, group.position = g.name, position
        groups.append((group, g.ids))
    room.groups = [group for group, _ in groups]
    order = [(None, i) for i in payload.loose] + [(group, i) for group, ids in groups for i in ids]
    for position, (group, instance_id) in enumerate(order):
        instances[instance_id].position, instances[instance_id].group = position, group
    session.commit()
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.instances.layout"})
    return LayoutRead(groups=[GroupRead.model_validate(g) for g in room.groups],
                      instances=[read_instance(instances[i], gm_view=True) for _, i in order])


@router.post("/{room_id}/instances", response_model=InstanceRead, status_code=status.HTTP_201_CREATED,
             summary="Mettre un monstre en jeu (MJ)")
def add_monster(room_id: int, payload: MonsterAdd, background: BackgroundTasks,
                user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    """Un monstre du MJ, ou un monstre de joueur accepté dans la room. Chaque appel ajoute un exemplaire,
    moniteurs au max, caché par défaut. Un monstre du MJ qui n'est pas dans la room y est rattaché par un
    lien `mj`, que les joueurs ne voient pas."""
    room = room_or_404(session, room_id, user, gm_only=True)
    character = session.get(Character, payload.character_id)
    link = next((rc for rc in room.characters if rc.character_id == payload.character_id), None)
    usable = character is not None and character.kind == CharacterKind.MONSTRE and (
        character.owner_id == user.id or (link is not None and link.status == RoomCharacterStatus.ACCEPTED))
    if not usable:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Monstre introuvable parmi les vôtres et ceux acceptés dans la room")
    if link is None:
        link = RoomCharacter(character=character, status=RoomCharacterStatus.GM)
        room.characters.append(link)
    instance = CharacterInstance(visibility=payload.visibility, position=_next_position(room),
                                 monitors={k: {"current": m, "max": m} for k, m in _sheet_max(link).items()})
    link.instances.append(instance)
    session.flush()
    _renumber(background, link, instance)
    return _save_and_push(session, background, instance, user)


def _renumber(background: BackgroundTasks, link: RoomCharacter, changed: CharacterInstance | None) -> None:
    """Les numéros des exemplaires (Loup 1, Loup 2...) bougent quand on en ajoute ou retire : on repousse les autres."""
    for other in link.instances:
        if other is not changed:
            push_instance(background, other)


@router.put("/{room_id}/instances/{instance_id}/visibility", response_model=InstanceRead,
            summary="Cacher, montrer ou révéler un personnage en jeu (MJ)")
def set_visibility(room_id: int, instance_id: int, payload: VisibilityUpdate, background: BackgroundTasks,
                   user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    room_or_404(session, room_id, user, gm_only=True)
    instance = _instance_or_404(session, room_id, instance_id, user)
    if instance.link.character.kind == CharacterKind.PJ:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Un PJ est toujours visible")
    instance.visibility = payload.visibility
    return _save_and_push(session, background, instance, user)


@router.delete("/{room_id}/instances/{instance_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Retirer un monstre du jeu (MJ)")
def remove_instance(room_id: int, instance_id: int, background: BackgroundTasks,
                    user: User = Depends(current_user), session: Session = Depends(get_session)) -> None:
    """Retire un exemplaire. Un PJ sort du jeu en sortant de la room, pas ici. Le lien `mj` d'un monstre
    du MJ disparaît avec son dernier exemplaire."""
    room = room_or_404(session, room_id, user, gm_only=True)
    instance = _instance_or_404(session, room_id, instance_id, user)
    link = instance.link
    if link.character.kind == CharacterKind.PJ:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Un PJ sort du jeu en sortant de la room")
    link.instances.remove(instance)
    if link.status == RoomCharacterStatus.GM and not link.instances:
        room.characters.remove(link)
    session.commit()
    background.add_task(manager.broadcast, room_channel(room_id), {"type": "room.instance.removed", "id": instance_id})
    _renumber(background, link, None)


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


@router.patch("/{room_id}/instances/{instance_id}/god-resources", response_model=InstanceRead,
               summary="Modifier une ressource d'un dieu")
def change_god_resource(room_id: int, instance_id: int, payload: GodResourceChange, background: BackgroundTasks,
                        user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    """La valeur est propre à la room. Elle reste entre 0 et le max de la ressource, s'il y en a un."""
    instance = _instance_or_404(session, room_id, instance_id, user)
    r = _god_resource_defs(instance.link.character).get((payload.god, payload.name))
    if r is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"« {payload.name} » n'est pas une ressource d'un dieu de ce personnage")
    values = {g: dict(v) for g, v in (instance.god_resources or {}).items()}
    current = payload.set if payload.set is not None else values.get(payload.god, {}).get(payload.name, 0)
    value = max(0, current + payload.delta)
    values.setdefault(payload.god, {})[payload.name] = value if r.max is None else min(r.max, value)
    instance.god_resources = values
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
        statuses.append({"id": secrets.token_hex(4), "label": label, "hidden": payload.hidden,
                         "color": payload.color.value})
        instance.statuses = statuses
    return _save_and_push(session, background, instance, user)


@router.patch("/{room_id}/instances/{instance_id}/statuses/{status_id}", response_model=InstanceRead,
              summary="Changer la couleur d'un statut, le cacher ou le révéler (MJ)")
def update_status(room_id: int, instance_id: int, status_id: str, payload: StatusUpdate, background: BackgroundTasks,
                  user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    instance = _instance_or_404(session, room_id, instance_id, user)
    if payload.hidden is not None and not _is_gm(instance, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ cache ou révèle un statut")
    _status_or_404(instance, status_id, user)
    changes = payload.model_dump(mode="json", exclude_none=True)
    instance.statuses = [{**s, **changes} if s["id"] == status_id else s for s in instance.statuses]
    return _save_and_push(session, background, instance, user)


@router.delete("/{room_id}/instances/{instance_id}/statuses/{status_id}", response_model=InstanceRead,
               summary="Retirer un statut")
def remove_status(room_id: int, instance_id: int, status_id: str, background: BackgroundTasks,
                  user: User = Depends(current_user), session: Session = Depends(get_session)) -> InstanceRead:
    instance = _instance_or_404(session, room_id, instance_id, user)
    _status_or_404(instance, status_id, user)
    instance.statuses = [s for s in instance.statuses if s["id"] != status_id]
    return _save_and_push(session, background, instance, user)
