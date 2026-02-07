"""
Camera Stream Proxy Endpoint
Handles video streaming for cameras without conflicting with AI Worker
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
import httpx
import logging

from ...core.database import get_db
from ... import models

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/cameras/{camera_id}/stream")
async def get_camera_stream(camera_id: int, db: Session = Depends(get_db)):
    """
    Get camera stream with proper handling for AI Worker-managed cameras
    
    - For webcam cameras (stream_url is numeric): Returns info message
    - For network cameras (RTSP/HTTP): Proxies the stream
    """
    # Get camera from database
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    stream_url = camera.stream_url
    
    # Check if it's a webcam (numeric stream_url like "0", "1")
    if stream_url and str(stream_url).isdigit():
        # Webcam is managed by AI Worker - return a helpful message
        return Response(
            content=f"Camera {camera.name} is a webcam device managed by AI Worker.\n"
                    f"Video feed is processed by AI Worker on port 8766.\n"
                    f"Camera ID: {camera_id}, Device: {stream_url}",
            media_type="text/plain",
            status_code=200
        )
    
    # For network cameras, we could proxy here
    # For now, return info about the camera
    return {
        "camera_id": camera_id,
        "name": camera.name,
        "stream_url": stream_url,
        "status": camera.status,
        "message": "Network camera streaming not yet implemented in proxy"
    }


@router.get("/cameras/{camera_id}/info")
async def get_camera_info(camera_id: int, db: Session = Depends(get_db)):
    """Get camera information including stream status"""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    is_webcam = str(camera.stream_url).isdigit() if camera.stream_url else False
    
    return {
        "id": camera.id,
        "name": camera.name,
        "location": camera.location,
        "stream_url": camera.stream_url,
        "is_webcam": is_webcam,
        "status": camera.status,
        "managed_by": "AI Worker" if is_webcam else "Backend",
        "ai_worker_port": 8766 if is_webcam else None
    }
