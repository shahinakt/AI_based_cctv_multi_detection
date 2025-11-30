# backend/app/schemas/camera_status.py

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CameraStatusBase(BaseModel):
    status: Optional[str] = None           # 'starting', 'running', 'stopped', 'error', 'inactive'
    error_message: Optional[str] = None
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    total_incidents: Optional[int] = None
    processing_device: Optional[str] = None


class CameraStatusUpdate(CameraStatusBase):
    """
    Payload received from AI worker when it updates camera status.
    All fields optional so worker can send partial updates.
    """
    pass


class CameraStatusOut(CameraStatusBase):
    """
    What we return to the frontend or for debugging.
    """
    id: int
    camera_id: int
    last_frame_time: Optional[datetime] = None
    started_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        orm_mode = True
