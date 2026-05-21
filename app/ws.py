from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.ws_message import WsMessage, WsMessageType

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)
        await self._notify_count()

    async def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)
        await self._notify_count()

    async def broadcast(self, msg: WsMessage):
        dead = []
        for ws in self._connections:
            try:
                await ws.send_json(msg.model_dump(by_alias=True, exclude_none=True))
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._connections:
                self._connections.remove(ws)

    async def _notify_count(self):
        await self.broadcast(
            WsMessage(type=WsMessageType.USER_COUNT, count=len(self._connections))
        )


manager = ConnectionManager()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
