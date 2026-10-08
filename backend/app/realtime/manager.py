"""Diffusion d'événements aux clients websocket.

Version mono-processus, en mémoire. Avec plusieurs workers ou serveurs, il faudra la remplacer
par un bus partagé (Redis pub/sub par exemple) en gardant la même interface.
"""

from collections import defaultdict
from collections.abc import Callable

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # Canal -> connexions ouvertes, avec le compte connecté derrière chacune (pour la présence).
        self._channels: dict[str, dict[WebSocket, int | None]] = defaultdict(dict)

    async def connect(self, channel: str, ws: WebSocket, user_id: int | None = None) -> None:
        await ws.accept()
        self._channels[channel][ws] = user_id

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        self._channels[channel].pop(ws, None)

    def online(self, channel: str) -> list[int]:
        """Comptes connectés au canal (une seule fois, même avec plusieurs onglets)."""
        return sorted({uid for uid in self._channels.get(channel, {}).values() if uid is not None})

    async def broadcast(self, channel: str, event: dict) -> None:
        for ws in list(self._channels.get(channel, ())):
            try:
                await ws.send_json(event)
            except Exception:
                self.disconnect(channel, ws)

    async def broadcast_each(self, channel: str, build: Callable[[int | None], dict]) -> None:
        """Comme `broadcast`, mais l'événement est construit pour chaque destinataire (son compte) :
        pour ne pas envoyer à un joueur ce que seul le MJ doit voir."""
        cache: dict[int | None, dict] = {}
        for ws, uid in list(self._channels.get(channel, {}).items()):
            if uid not in cache:
                cache[uid] = build(uid)
            try:
                await ws.send_json(cache[uid])
            except Exception:
                self.disconnect(channel, ws)

    async def kick(self, channel: str, user_id: int | None = None, code: int = 4403) -> None:
        """Ferme les connexions d'un compte sur un canal (de tout le monde si `user_id` est None) :
        quelqu'un qui quitte une room ne doit plus recevoir son chat."""
        for ws, uid in list(self._channels.get(channel, {}).items()):
            if user_id is None or uid == user_id:
                self.disconnect(channel, ws)
                try:
                    await ws.close(code=code)
                except Exception:
                    pass


manager = ConnectionManager()

# Canaux internes de la liste des personnages. Le client s'abonne à `characters` et le serveur le
# branche sur le bon canal : un joueur n'entend parler que de ses personnages, un admin de tous.
ALL_CHARACTERS = "characters:all"


def owner_channel(owner_id: int | None) -> str:
    return f"characters:user:{owner_id}"


async def notify_character(event_type: str, character_id: int, *owner_ids: int | None) -> None:
    """Prévient la liste des admins, celle de chaque propriétaire concerné (l'ancien et le nouveau
    quand le personnage change de mains) et les clients qui suivent ce personnage."""
    event = {"type": event_type, "id": character_id}
    for channel in {ALL_CHARACTERS, f"character:{character_id}", *map(owner_channel, owner_ids)}:
        await manager.broadcast(channel, event)


# Rooms : un canal `room:<id>` par room. Le temps réel s'y limite à la présence et au chat.
def room_channel(room_id: int) -> str:
    return f"room:{room_id}"


async def broadcast_presence(room_id: int) -> None:
    channel = room_channel(room_id)
    await manager.broadcast(channel, {"type": "room.presence", "online": manager.online(channel)})


async def notify_room_characters(room_id: int) -> None:
    """Les personnages de la room ont changé (proposition, acceptation, refus, retrait).

    Sans contenu : chacun ne voit pas la même chose (le MJ voit toutes les propositions, un joueur
    seulement les siennes), les clients relisent donc la room avec leurs propres droits."""
    await manager.broadcast(room_channel(room_id), {"type": "room.characters"})


async def remove_from_room(room_id: int, user_id: int | None = None) -> None:
    """Coupe le canal de la room pour un compte (exclu ou parti), ou pour tous (room supprimée)."""
    await manager.kick(room_channel(room_id), user_id)
    if user_id is not None:
        await broadcast_presence(room_id)
