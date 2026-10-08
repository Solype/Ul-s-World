"""Rooms (tables de jeu).

N'importe quel compte crée une room et en devient le MJ. Les joueurs entrent avec le code d'invitation,
ou le MJ les ajoute par identifiant. Un joueur propose ses personnages (PJ, animaux de compagnie...),
que le MJ accepte ou refuse ; ceux du MJ entrent directement. Tous les membres voient les fiches des
personnages acceptés (voir `can_view` dans deps.py), mais seul le propriétaire les modifie.

Le temps réel (canal `room:<id>`) : la présence, le chat, et un signal `room.characters` quand un
personnage est proposé, accepté, refusé ou retiré (les clients relisent alors `GET /api/rooms/{id}`).
Le reste (membres, nom) n'est pas poussé.
"""

import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, is_room_member
from app.db import get_session
from app.models import Character, ChatMessage, Room, RoomCharacter, RoomMember, User
from app.realtime.manager import manager, notify_room_characters, remove_from_room, room_channel
from app.schemas import (
    AddMember,
    ChatMessageCreate,
    ChatMessageRead,
    JoinRoom,
    RoomCharacterStatus,
    RoomCreate,
    RoomRead,
    RoomSummary,
    RoomUpdate,
    SubmitCharacter,
)

router = APIRouter(prefix="/rooms", tags=["rooms"])

# Sans 0/O ni 1/I : le code se dicte à voix haute autour de la table.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def _new_invite_code(session: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not session.scalar(select(exists().where(Room.invite_code == code))):
            return code


def _normalize_code(code: str) -> str:
    return "".join(c for c in code.upper() if c.isalnum())


def _room_or_404(session: Session, room_id: int, user: User, gm_only: bool = False) -> Room:
    """404 si on n'est pas membre (la room n'existe pas pour nous), 403 si l'action est réservée au MJ."""
    room = session.get(Room, room_id)
    if room is None or not is_room_member(room, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room introuvable")
    if gm_only and room.gm_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé au MJ de la room")
    return room


def _read(room: Room, user: User) -> RoomRead:
    is_gm = room.gm_id == user.id
    visible = [rc for rc in room.characters
               if is_gm or rc.status == RoomCharacterStatus.ACCEPTED or rc.character.owner_id == user.id]
    return RoomRead.model_validate({
        "id": room.id, "name": room.name, "gm": room.gm, "created_at": room.created_at,
        "invite_code": room.invite_code if is_gm else None,
        "members": room.members, "characters": visible,
    })


def _add_member(session: Session, room: Room, user: User) -> None:
    if not is_room_member(room, user):
        room.members.append(RoomMember(user=user))
    session.commit()


# --- Rooms ---------------------------------------------------------------------------------------------


@router.get("", response_model=list[RoomSummary], summary="Mes rooms (MJ ou joueur)")
def list_rooms(user: User = Depends(current_user), session: Session = Depends(get_session)) -> list[Room]:
    is_player = exists().where(RoomMember.room_id == Room.id, RoomMember.user_id == user.id)
    return list(session.scalars(select(Room).where(or_(Room.gm_id == user.id, is_player))
                                .order_by(Room.created_at.desc())))


@router.post("", response_model=RoomRead, status_code=status.HTTP_201_CREATED, summary="Créer une room (on en est le MJ)")
def create_room(payload: RoomCreate, user: User = Depends(current_user),
                session: Session = Depends(get_session)) -> RoomRead:
    room = Room(name=payload.name, gm=user, invite_code=_new_invite_code(session))
    session.add(room)
    session.commit()
    return _read(room, user)


@router.get("/{room_id}", response_model=RoomRead, summary="Lire une room")
def get_room(room_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)) -> RoomRead:
    return _read(_room_or_404(session, room_id, user), user)


@router.patch("/{room_id}", response_model=RoomRead, summary="Renommer une room (MJ)")
def update_room(room_id: int, payload: RoomUpdate, user: User = Depends(current_user),
                session: Session = Depends(get_session)) -> RoomRead:
    room = _room_or_404(session, room_id, user, gm_only=True)
    room.name = payload.name
    session.commit()
    return _read(room, user)


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer une room (MJ)")
def delete_room(room_id: int, background: BackgroundTasks, user: User = Depends(current_user),
                session: Session = Depends(get_session)) -> None:
    """Les personnages ne sont pas supprimés, seulement retirés de la room. Le chat est effacé."""
    session.delete(_room_or_404(session, room_id, user, gm_only=True))
    session.commit()
    background.add_task(remove_from_room, room_id)


@router.post("/{room_id}/invite-code", response_model=RoomRead, summary="Nouveau code d'invitation (MJ)")
def regenerate_code(room_id: int, user: User = Depends(current_user),
                    session: Session = Depends(get_session)) -> RoomRead:
    """L'ancien code ne fonctionne plus ; les membres déjà entrés restent."""
    room = _room_or_404(session, room_id, user, gm_only=True)
    room.invite_code = _new_invite_code(session)
    session.commit()
    return _read(room, user)


# --- Membres -------------------------------------------------------------------------------------------


@router.post("/join", response_model=RoomRead, summary="Rejoindre une room avec son code")
def join_room(payload: JoinRoom, user: User = Depends(current_user), session: Session = Depends(get_session)) -> RoomRead:
    room = session.scalar(select(Room).where(Room.invite_code == _normalize_code(payload.code)))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Code d'invitation inconnu")
    _add_member(session, room, user)
    return _read(room, user)


@router.post("/{room_id}/members", response_model=RoomRead, summary="Ajouter un joueur par identifiant (MJ)")
def add_member(room_id: int, payload: AddMember, user: User = Depends(current_user),
               session: Session = Depends(get_session)) -> RoomRead:
    room = _room_or_404(session, room_id, user, gm_only=True)
    player = session.scalar(select(User).where(User.username == payload.username.strip().lower()))
    if player is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun compte avec cet identifiant")
    _add_member(session, room, player)
    return _read(room, user)


@router.delete("/{room_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Exclure un joueur (MJ) ou quitter la room")
def remove_member(room_id: int, user_id: int, background: BackgroundTasks, user: User = Depends(current_user),
                  session: Session = Depends(get_session)) -> None:
    """Les personnages du joueur sont retirés de la room. Le MJ ne peut pas partir : il supprime la room."""
    room = _room_or_404(session, room_id, user)
    if user_id != user.id and room.gm_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul le MJ peut exclure un joueur")
    member = next((m for m in room.members if m.user_id == user_id), None)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce compte n'est pas joueur de la room")
    room.members.remove(member)
    had_characters = any(rc.character.owner_id == user_id for rc in room.characters)
    room.characters[:] = [rc for rc in room.characters if rc.character.owner_id != user_id]
    session.commit()
    background.add_task(remove_from_room, room_id, user_id)
    if had_characters:
        background.add_task(notify_room_characters, room_id)


# --- Personnages ---------------------------------------------------------------------------------------


def _link_or_404(room: Room, character_id: int) -> RoomCharacter:
    link = next((rc for rc in room.characters if rc.character_id == character_id), None)
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce personnage n'est pas dans la room")
    return link


@router.post("/{room_id}/characters", response_model=RoomRead, status_code=status.HTTP_201_CREATED,
             summary="Proposer un de ses personnages")
def submit_character(room_id: int, payload: SubmitCharacter, background: BackgroundTasks,
                     user: User = Depends(current_user), session: Session = Depends(get_session)) -> RoomRead:
    """N'importe quel type (PJ, animal de compagnie...). En attente de l'accord du MJ ; ceux du MJ entrent directement."""
    room = _room_or_404(session, room_id, user)
    character = session.get(Character, payload.character_id)
    if character is None or character.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Personnage introuvable parmi les vôtres")
    if any(rc.character_id == character.id for rc in room.characters):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce personnage est déjà dans la room")
    accepted = room.gm_id == user.id
    room.characters.append(RoomCharacter(
        character=character, status=RoomCharacterStatus.ACCEPTED if accepted else RoomCharacterStatus.PENDING))
    session.commit()
    background.add_task(notify_room_characters, room_id)
    return _read(room, user)


@router.post("/{room_id}/characters/{character_id}/accept", response_model=RoomRead,
             summary="Accepter un personnage proposé (MJ)")
def accept_character(room_id: int, character_id: int, background: BackgroundTasks,
                     user: User = Depends(current_user), session: Session = Depends(get_session)) -> RoomRead:
    room = _room_or_404(session, room_id, user, gm_only=True)
    _link_or_404(room, character_id).status = RoomCharacterStatus.ACCEPTED
    session.commit()
    background.add_task(notify_room_characters, room_id)
    return _read(room, user)


@router.delete("/{room_id}/characters/{character_id}", response_model=RoomRead,
               summary="Refuser ou retirer un personnage (MJ), ou retirer le sien")
def remove_character(room_id: int, character_id: int, background: BackgroundTasks,
                     user: User = Depends(current_user), session: Session = Depends(get_session)) -> RoomRead:
    room = _room_or_404(session, room_id, user)
    link = _link_or_404(room, character_id)
    if room.gm_id != user.id and link.character.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seuls le MJ et le propriétaire peuvent le retirer")
    room.characters.remove(link)
    session.commit()
    background.add_task(notify_room_characters, room_id)
    return _read(room, user)


# --- Chat ----------------------------------------------------------------------------------------------


@router.get("/{room_id}/messages", response_model=list[ChatMessageRead], summary="Historique du chat")
def list_messages(room_id: int, before: int | None = Query(None, description="Messages plus anciens que cet id."),
                  limit: int = Query(50, ge=1, le=200), user: User = Depends(current_user),
                  session: Session = Depends(get_session)) -> list[ChatMessage]:
    """Les `limit` derniers messages (avant `before`), du plus ancien au plus récent."""
    _room_or_404(session, room_id, user)
    query = select(ChatMessage).where(ChatMessage.room_id == room_id)
    if before is not None:
        query = query.where(ChatMessage.id < before)
    latest = list(session.scalars(query.order_by(ChatMessage.id.desc()).limit(limit)))
    return latest[::-1]


@router.post("/{room_id}/messages", response_model=ChatMessageRead, status_code=status.HTTP_201_CREATED,
             summary="Envoyer un message")
def post_message(room_id: int, payload: ChatMessageCreate, background: BackgroundTasks,
                 user: User = Depends(current_user), session: Session = Depends(get_session)) -> ChatMessageRead:
    """Enregistré, puis poussé à toute la room : `{"type": "room.message", "message": {...}}`."""
    _room_or_404(session, room_id, user)
    if not payload.body.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Message vide")
    message = ChatMessage(room_id=room_id, author=user, body=payload.body.strip())
    session.add(message)
    session.commit()
    read = ChatMessageRead.model_validate(message)
    background.add_task(manager.broadcast, room_channel(room_id),
                        {"type": "room.message", "message": read.model_dump(mode="json")})
    return read
