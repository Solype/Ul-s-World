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
