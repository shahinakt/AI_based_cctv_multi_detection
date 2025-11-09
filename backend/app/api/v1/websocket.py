"""
WebSocket API - FIXED VERSION
Corrects token authentication and adds error handling
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List
import json

from ... import crud
from ...core.database import get_db
from ...core.security import verify_token
from ...schemas import IncidentOut

router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections with improved error handling"""
    
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        """Accept and register new connection"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        print(f"✅ WebSocket connected: User {user_id}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        """Remove connection"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"🔌 WebSocket disconnected: User {user_id}")

    async def broadcast(self, incident: IncidentOut, target_roles: List[str] = None):
        """
        Broadcast incident to all connected users
        
        Args:
            incident: Incident object to broadcast
            target_roles: List of roles to send to (None = all)
        """
        message = json.dumps(incident.dict())
        
        dead_connections = []
        
        for user_id, connections in list(self.active_connections.items()):
            for connection in connections:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    print(f"Failed to send to user {user_id}: {e}")
                    dead_connections.append((connection, user_id))
        
        # Clean up dead connections
        for connection, user_id in dead_connections:
            self.disconnect(connection, user_id)


# Global manager
manager = ConnectionManager()


@router.websocket("/incidents")
async def websocket_incidents(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time incident notifications
    
    Query Parameters:
        token: JWT access token for authentication
    """
    try:
        # Verify token - FIXED: Use 'sub' not 'username'
        payload = verify_token(token)
        username = payload.get("sub")
        
        if not username:
            await websocket.close(code=1008, reason="Invalid token payload")
            return
        
        # Get user from database
        user = crud.get_user_by_username(db, username)
        
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="User not found or inactive")
            return
        
        # Connect user
        await manager.connect(websocket, user.id)
        
        try:
            # Keep connection alive and handle client messages
            while True:
                data = await websocket.receive_text()
                
                # Handle client commands
                try:
                    message = json.loads(data)
                    
                    if message.get('action') == 'subscribe':
                        camera_id = message.get('camera_id')
                        await websocket.send_text(json.dumps({
                            'type': 'subscription',
                            'status': 'success',
                            'camera_id': camera_id
                        }))
                    
                    elif message.get('action') == 'ping':
                        await websocket.send_text(json.dumps({
                            'type': 'pong',
                            'timestamp': payload.get('exp')
                        }))
                        
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({
                        'type': 'error',
                        'message': 'Invalid JSON'
                    }))
                    
        except WebSocketDisconnect:
            manager.disconnect(websocket, user.id)
            
    except HTTPException as e:
        await websocket.close(code=1008, reason=str(e.detail))
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011, reason="Internal server error")


# Function to broadcast from tasks/API
async def broadcast_incident(incident: IncidentOut):
    """
    Broadcast incident to all connected clients
    Call this from Celery tasks or API routes
    """
    await manager.broadcast(incident)