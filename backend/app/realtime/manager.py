"""Diffusion d'événements aux clients websocket.

Version mono-processus, en mémoire. Avec plusieurs workers ou serveurs, il faudra la remplacer
par un bus partagé (Redis pub/sub par exemple) en gardant la même interface.
"""

from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, channel: str, ws: WebSocket) -> None:
        await ws.accept()
        self._channels[channel].add(ws)

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        self._channels[channel].discard(ws)

    async def broadcast(self, channel: str, event: dict) -> None:
        for ws in list(self._channels.get(channel, ())):
            try:
                await ws.send_json(event)
            except Exception:
                self.disconnect(channel, ws)


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
