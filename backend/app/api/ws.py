from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.realtime.manager import manager

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/{channel}")
async def websocket_endpoint(ws: WebSocket, channel: str) -> None:
    """Canaux : `characters` (liste) ou `character:<id>` (un personnage).

    Le serveur pousse des événements `{"type": "character.updated", "id": 3}`.
    Les messages reçus du client sont ignorés pour l'instant : c'est ici qu'on branchera
    la suite (dés, chat de table, édition à plusieurs...).
    """
    await manager.connect(channel, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(channel, ws)
