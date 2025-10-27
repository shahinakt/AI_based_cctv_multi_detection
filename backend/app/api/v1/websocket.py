from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, List
from ... import crud
from ...core.database import get_db
from ...core.security import verify_token
from ...dependencies import get_db as db_dep
from ...schemas import IncidentOut

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast(self, incident: IncidentOut):
        for user_id, connections in list(self.active_connections.items()):
            # Filter: send to security/viewer for high/critical
            # In prod, fetch user role from DB or cache
            # Assume broadcast to all connected for simplicity; refine with role cache
            for connection in connections:
                try:
                    await connection.send_json(incident.dict())
                except Exception:
                    # Clean up dead connections
                    self.disconnect(connection, user_id)

# Global manager (attach to app in main.py if needed)
manager = ConnectionManager()

@router.websocket("/incidents")
async def websocket_incidents(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(db_dep)
):
    credentials_exception = {"code": 1008, "reason": "Invalid token"}
    try:
        payload = verify_token(token)
        username = payload["username"]
        user = crud.get_user_by_username(db, username)
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="Invalid user")
            return
    except Exception:
        await websocket.close(**credentials_exception)
        return

    await manager.connect(websocket, user.id)
    try:
        while True:
            # Echo or handle messages (e.g., subscribe to camera)
            data = await websocket.receive_text()
            # Optional: handle client messages, e.g., {"action": "subscribe", "camera_id": 1}
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id)

# To broadcast from tasks/API: manager.broadcast(incident_instance)